import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveClaudeCredentials,
  type ResolveClaudeCredentialsDependencies,
} from '@/modules/providers/list/claude/claude-auth.provider.js';

const HOME = '/home/test';

const enoent = (): never => {
  const error = new Error('ENOENT') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  throw error;
};

type FileMap = Record<string, string>;

const settingsPath = `${HOME}/.claude/settings.json`;
const credentialsPath = `${HOME}/.claude/.credentials.json`;
const configPath = `${HOME}/.claude.json`;

const makeDeps = (
  overrides: Partial<ResolveClaudeCredentialsDependencies> = {},
  files: FileMap = {},
): ResolveClaudeCredentialsDependencies => ({
  readFile: async (target: string) => {
    if (target in files) {
      return files[target];
    }
    return enoent();
  },
  homedir: () => HOME,
  platform: 'darwin',
  env: {},
  hasKeychainCredential: () => true,
  now: () => 1_000,
  ...overrides,
});

test('macOS keychain login: falls back to oauthAccount when the credentials file is absent', async () => {
  const deps = makeDeps(
    { platform: 'darwin', hasKeychainCredential: () => true },
    { [configPath]: JSON.stringify({ oauthAccount: { emailAddress: 'jichen@liftoff.io' } }) },
  );

  const result = await resolveClaudeCredentials(deps);

  assert.equal(result.authenticated, true);
  assert.equal(result.email, 'jichen@liftoff.io');
  assert.equal(result.method, 'oauth');
});

test('non-macOS oauthAccount login: authenticates without consulting the keychain', async () => {
  let keychainConsulted = false;
  const deps = makeDeps(
    {
      platform: 'linux',
      hasKeychainCredential: () => {
        keychainConsulted = true;
        return false;
      },
    },
    { [configPath]: JSON.stringify({ oauthAccount: { emailAddress: 'jichen@liftoff.io' } }) },
  );

  const result = await resolveClaudeCredentials(deps);

  assert.equal(result.authenticated, true);
  assert.equal(result.method, 'oauth');
  assert.equal(keychainConsulted, false);
});

test('macOS with a stale oauthAccount but no keychain item is treated as not authenticated', async () => {
  const deps = makeDeps(
    { platform: 'darwin', hasKeychainCredential: () => false },
    { [configPath]: JSON.stringify({ oauthAccount: { emailAddress: 'jichen@liftoff.io' } }) },
  );

  const result = await resolveClaudeCredentials(deps);

  assert.equal(result.authenticated, false);
  assert.match(result.error ?? '', /not authenticated/i);
});

test('no credentials anywhere reports the missing-credentials error', async () => {
  const result = await resolveClaudeCredentials(makeDeps());

  assert.equal(result.authenticated, false);
  assert.match(result.error ?? '', /not authenticated/i);
});

test('environment ANTHROPIC_API_KEY still authenticates as api_key', async () => {
  const deps = makeDeps({ env: { ANTHROPIC_API_KEY: 'sk-ant-test' } });

  const result = await resolveClaudeCredentials(deps);

  assert.equal(result.authenticated, true);
  assert.equal(result.method, 'api_key');
});

test('valid credentials file still authenticates as credentials_file', async () => {
  const deps = makeDeps(
    { now: () => 1_000 },
    {
      [credentialsPath]: JSON.stringify({
        claudeAiOauth: { accessToken: 'token', expiresAt: 5_000 },
        email: 'jichen@liftoff.io',
      }),
    },
  );

  const result = await resolveClaudeCredentials(deps);

  assert.equal(result.authenticated, true);
  assert.equal(result.method, 'credentials_file');
  assert.equal(result.email, 'jichen@liftoff.io');
});

test('expired credentials file is definitive and does not fall through to oauthAccount', async () => {
  const deps = makeDeps(
    { now: () => 10_000, hasKeychainCredential: () => true },
    {
      [credentialsPath]: JSON.stringify({
        claudeAiOauth: { accessToken: 'token', expiresAt: 5_000 },
      }),
      [configPath]: JSON.stringify({ oauthAccount: { emailAddress: 'jichen@liftoff.io' } }),
    },
  );

  const result = await resolveClaudeCredentials(deps);

  assert.equal(result.authenticated, false);
  assert.match(result.error ?? '', /expired/i);
});
