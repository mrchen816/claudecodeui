import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import spawn from 'cross-spawn';

import { resolveClaudeCodeExecutablePath } from '@/shared/claude-cli-path.js';
import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';
import { readObjectRecord, readOptionalString } from '@/shared/utils.js';

type ClaudeCredentialsStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

/**
 * Injectable dependencies for {@link resolveClaudeCredentials}. Mirrors the
 * dependency-injection style of {@link resolveClaudeCodeExecutablePath} so the
 * credential-resolution logic can be tested without touching the real
 * filesystem, keychain, or clock.
 */
export type ResolveClaudeCredentialsDependencies = {
  readFile: (target: string, encoding: 'utf8') => Promise<string>;
  homedir: () => string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /**
   * Whether the macOS login keychain holds a `Claude Code-credentials` item.
   * Used only to confirm a keychain-backed OAuth login without reading the
   * secret itself.
   */
  hasKeychainCredential: () => boolean;
  now: () => number;
};

const MISSING_CREDENTIALS_ERROR =
  'Claude CLI is not authenticated. Run claude /login or configure ANTHROPIC_API_KEY.';

const hasErrorCode = (error: unknown, code: string): boolean => (
  error instanceof Error && 'code' in error && error.code === code
);

/**
 * Reads Claude settings env values that the CLI can use even when the server
 * process env is empty.
 */
const loadSettingsEnv = async (
  deps: ResolveClaudeCredentialsDependencies,
): Promise<Record<string, unknown>> => {
  try {
    const settingsPath = path.join(deps.homedir(), '.claude', 'settings.json');
    const content = await deps.readFile(settingsPath, 'utf8');
    const settings = readObjectRecord(JSON.parse(content));
    return readObjectRecord(settings?.env) ?? {};
  } catch {
    return {};
  }
};

/**
 * Reads `~/.claude/.credentials.json`, the file-based OAuth store used by Claude
 * Code on platforms without a system keychain (e.g. Linux).
 *
 * Returns a definitive status when the file yields a decision (valid token,
 * expired token, or an unreadable file), and `null` when the file is absent or
 * carries no token so the caller can fall back to keychain-based login.
 */
const readCredentialsFile = async (
  deps: ResolveClaudeCredentialsDependencies,
): Promise<ClaudeCredentialsStatus | null> => {
  try {
    const credPath = path.join(deps.homedir(), '.claude', '.credentials.json');
    const content = await deps.readFile(credPath, 'utf8');
    const creds = readObjectRecord(JSON.parse(content)) ?? {};
    const oauth = readObjectRecord(creds.claudeAiOauth);
    const accessToken = readOptionalString(oauth?.accessToken);

    if (!accessToken) {
      return null;
    }

    const expiresAt = typeof oauth?.expiresAt === 'number' ? oauth.expiresAt : undefined;
    const email = readOptionalString(creds.email) ?? readOptionalString(creds.user) ?? null;

    if (!expiresAt || deps.now() < expiresAt) {
      return { authenticated: true, email, method: 'credentials_file' };
    }

    return {
      authenticated: false,
      email: null,
      method: null,
      error: 'Claude login has expired. Run claude /login again.',
    };
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null;
    }

    return {
      authenticated: false,
      email: null,
      method: null,
      error: error instanceof SyntaxError
        ? 'Claude credentials are unreadable. Run claude /login again.'
        : 'Unable to read Claude credentials. Run claude /login again.',
    };
  }
};

/**
 * Detects a Claude Code OAuth login recorded via `oauthAccount` in
 * `~/.claude.json`. This covers macOS, where `claude /login` stores the OAuth
 * token in the system keychain rather than in `~/.claude/.credentials.json`.
 *
 * On macOS the keychain item is additionally required so that a stale
 * `oauthAccount` (left behind after logout) is not mistaken for a live session.
 */
const readOAuthAccountLogin = async (
  deps: ResolveClaudeCredentialsDependencies,
): Promise<ClaudeCredentialsStatus | null> => {
  try {
    const configPath = path.join(deps.homedir(), '.claude.json');
    const content = await deps.readFile(configPath, 'utf8');
    const config = readObjectRecord(JSON.parse(content)) ?? {};
    const oauthAccount = readObjectRecord(config.oauthAccount);
    const email =
      readOptionalString(oauthAccount?.emailAddress) ?? readOptionalString(oauthAccount?.email);

    if (!email) {
      return null;
    }

    if (deps.platform === 'darwin' && !deps.hasKeychainCredential()) {
      return null;
    }

    return { authenticated: true, email, method: 'oauth' };
  } catch {
    return null;
  }
};

/**
 * Resolves Claude credentials in the same priority order used by Claude Code:
 * environment variables, `settings.json` env, long-lived OAuth env token,
 * the `.credentials.json` file, and finally a keychain-backed OAuth login
 * recorded in `~/.claude.json`.
 */
export const resolveClaudeCredentials = async (
  deps: ResolveClaudeCredentialsDependencies,
): Promise<ClaudeCredentialsStatus> => {
  if (deps.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
    return { authenticated: true, email: 'Auth Token', method: 'api_key' };
  }

  if (deps.env.ANTHROPIC_API_KEY?.trim()) {
    return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
  }

  const settingsEnv = await loadSettingsEnv(deps);
  if (readOptionalString(settingsEnv.ANTHROPIC_API_KEY)) {
    return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
  }

  if (readOptionalString(settingsEnv.ANTHROPIC_AUTH_TOKEN)) {
    return { authenticated: true, email: 'Configured via settings.json', method: 'api_key' };
  }

  if (deps.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
    return { authenticated: true, email: 'OAuth Token (long-lived)', method: 'environment' };
  }

  if (readOptionalString(settingsEnv.CLAUDE_CODE_OAUTH_TOKEN)) {
    return { authenticated: true, email: 'OAuth Token (long-lived)', method: 'environment' };
  }

  const fileStatus = await readCredentialsFile(deps);
  if (fileStatus) {
    return fileStatus;
  }

  const oauthStatus = await readOAuthAccountLogin(deps);
  if (oauthStatus) {
    return oauthStatus;
  }

  return {
    authenticated: false,
    email: null,
    method: null,
    error: MISSING_CREDENTIALS_ERROR,
  };
};

const hasKeychainCredential = (): boolean => {
  try {
    const result = spawn.sync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials'],
      { stdio: 'ignore', timeout: 5000 },
    );
    return result.status === 0;
  } catch {
    return false;
  }
};

const defaultDependencies = (): ResolveClaudeCredentialsDependencies => ({
  readFile,
  homedir: os.homedir,
  platform: process.platform,
  env: process.env,
  hasKeychainCredential,
  now: () => Date.now(),
});

export class ClaudeProviderAuth implements IProviderAuth {
  /**
   * Checks whether the Claude Code CLI is available on this host.
   */
  private checkInstalled(): boolean {
    const cliPath = resolveClaudeCodeExecutablePath(process.env.CLAUDE_CLI_PATH);
    try {
      spawn.sync(cliPath, ['--version'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns Claude installation and credential status using Claude Code's auth priority.
   */
  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();

    if (!installed) {
      return {
        installed,
        provider: 'claude',
        authenticated: false,
        email: null,
        method: null,
        error: 'Claude Code CLI is not installed',
      };
    }

    const credentials = await this.checkCredentials();

    return {
      installed,
      provider: 'claude',
      authenticated: credentials.authenticated,
      email: credentials.authenticated ? credentials.email || 'Authenticated' : credentials.email,
      method: credentials.method,
      error: credentials.authenticated ? undefined : credentials.error || 'Not authenticated',
    };
  }

  /**
   * Checks Claude credentials using the injectable resolver. Kept as a class method so
   * existing unit tests can call it without shelling out to the Claude CLI.
   */
  private checkCredentials(): Promise<ClaudeCredentialsStatus> {
    return resolveClaudeCredentials(defaultDependencies());
  }
}
