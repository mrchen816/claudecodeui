import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { CursorSessionSynchronizer } from '@/modules/providers/list/cursor/cursor-session-synchronizer.provider.js';
import { CursorSessionsProvider } from '@/modules/providers/list/cursor/cursor-sessions.provider.js';

const patchHomeDir = (nextHomeDir: string) => {
  const original = os.homedir;
  (os as any).homedir = () => nextHomeDir;
  return () => {
    (os as any).homedir = original;
  };
};

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'cursor-provider-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

const writeCursorAgentTranscript = async (
  homeDir: string,
  workspacePath: string,
  sessionId: string,
  firstUserMessage: string,
): Promise<string> => {
  const encodedProject = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  const transcriptDir = path.join(
    homeDir,
    '.cursor',
    'projects',
    encodedProject,
    'agent-transcripts',
    sessionId,
  );
  await mkdir(transcriptDir, { recursive: true });

  const filePath = path.join(transcriptDir, `${sessionId}.jsonl`);
  await writeFile(
    filePath,
    `${JSON.stringify({
      role: 'user',
      message: {
        content: [{
          type: 'text',
          text: `<timestamp>Sunday, Jul 19, 2026</timestamp>\n<user_query>${firstUserMessage}</user_query>`,
        }],
      },
    })}\n${JSON.stringify({
      role: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Acknowledged.' }],
      },
    })}\n`,
    'utf8',
  );

  return filePath;
};

test('Cursor synchronizer indexes agent-transcript JSONL without worker.log', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cursorws'));
  const workspacePath = tempRoot;
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    const filePath = await writeCursorAgentTranscript(
      tempRoot,
      workspacePath,
      'cursor-session-1',
      'Sync this Cursor chat',
    );

    await withIsolatedDatabase(async () => {
      const synchronizer = new CursorSessionSynchronizer();
      const sessionId = await synchronizer.synchronizeFile(filePath);

      assert.equal(sessionId, 'cursor-session-1');
      const row = sessionsDb.getSessionById('cursor-session-1');
      assert.equal(row?.project_path, workspacePath);
      assert.equal(row?.jsonl_path, filePath);
      assert.equal(row?.custom_name, 'Sync this Cursor chat');
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('Cursor synchronizer skips subagent transcripts', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cursorws'));
  const workspacePath = tempRoot;
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    const parentFilePath = await writeCursorAgentTranscript(
      tempRoot,
      workspacePath,
      'cursor-parent',
      'Parent session',
    );
    const subagentPath = path.join(path.dirname(parentFilePath), 'subagents', 'cursor-subagent.jsonl');
    await mkdir(path.dirname(subagentPath), { recursive: true });
    await writeFile(
      subagentPath,
      `${JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: '<user_query>Subagent task</user_query>' }] },
      })}\n`,
      'utf8',
    );

    await withIsolatedDatabase(async () => {
      const synchronizer = new CursorSessionSynchronizer();
      assert.equal(await synchronizer.synchronizeFile(parentFilePath), 'cursor-parent');
      assert.equal(await synchronizer.synchronizeFile(subagentPath), null);
      assert.equal(sessionsDb.getAllSessions().length, 1);
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('Cursor synchronizer decodes project folders that contain dashes', { concurrency: false }, async () => {
  const workspaceParent = await mkdtemp(path.join(os.tmpdir(), 'cursorws'));
  const workspacePath = path.join(workspaceParent, 'my-app');
  await mkdir(workspacePath, { recursive: true });
  const restoreHomeDir = patchHomeDir(workspaceParent);

  try {
    const filePath = await writeCursorAgentTranscript(
      workspaceParent,
      workspacePath,
      'cursor-dashed-path',
      'Dash path session',
    );

    await withIsolatedDatabase(async () => {
      const synchronizer = new CursorSessionSynchronizer();
      const sessionId = await synchronizer.synchronizeFile(filePath);
      assert.equal(sessionId, 'cursor-dashed-path');
      assert.equal(sessionsDb.getSessionById('cursor-dashed-path')?.project_path, workspacePath);
    });
  } finally {
    restoreHomeDir();
    await rm(workspaceParent, { recursive: true, force: true });
  }
});

test('Cursor synchronizer full-scans to backfill sessions missed by incremental sync', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cursorws'));
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    const older = await writeCursorAgentTranscript(tempRoot, tempRoot, 'cursor-old', 'Older session');
    const newer = await writeCursorAgentTranscript(tempRoot, tempRoot, 'cursor-new', 'Newer session');

    await withIsolatedDatabase(async () => {
      const synchronizer = new CursorSessionSynchronizer();
      assert.equal(await synchronizer.synchronize(new Date()), 2);
      assert.equal(sessionsDb.getSessionById('cursor-old')?.custom_name, 'Older session');
      assert.equal(sessionsDb.getSessionById('cursor-new')?.custom_name, 'Newer session');

      // Touch only the newer transcript; a second full scan must still keep both rows.
      const { utimes } = await import('node:fs/promises');
      const now = new Date();
      await utimes(newer, now, now);
      assert.equal(await synchronizer.synchronize(new Date()), 2);
      assert.equal(sessionsDb.getAllSessions().length, 2);
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('Cursor history loads agent-transcript JSONL when store.db is missing', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cursorws'));
  const workspacePath = tempRoot;
  const restoreHomeDir = patchHomeDir(tempRoot);

  try {
    const filePath = await writeCursorAgentTranscript(
      tempRoot,
      workspacePath,
      'cursor-history-1',
      'Show me the history',
    );

    await withIsolatedDatabase(async () => {
      sessionsDb.createSession(
        'cursor-history-1',
        'cursor',
        workspacePath,
        'Show me the history',
        null,
        null,
        filePath,
      );

      const provider = new CursorSessionsProvider();
      const history = await provider.fetchHistory('cursor-history-1', {
        projectPath: workspacePath,
        providerSessionId: 'cursor-history-1',
      });

      assert.equal(history.total, 2);
      assert.equal(history.messages.length, 2);
      assert.equal(history.messages[0].role, 'user');
      assert.equal(history.messages[0].content, 'Show me the history');
      assert.equal(history.messages[1].role, 'assistant');
      assert.equal(history.messages[1].content, 'Acknowledged.');
    });
  } finally {
    restoreHomeDir();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
