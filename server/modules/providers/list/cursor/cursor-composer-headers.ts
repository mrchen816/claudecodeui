import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolves Cursor's global `state.vscdb`, which stores composer sidebar titles.
 */
export function resolveCursorGlobalStateDbPath(): string | null {
  const homeDir = os.homedir();

  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      return null;
    }
    return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }

  return path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

/**
 * Loads Cursor composer sidebar titles keyed by provider-native session id.
 *
 * Cursor stores auto-generated chat titles in the `composerHeaders` table of
 * global `state.vscdb`, separate from agent-transcript JSONL files.
 */
export async function loadCursorComposerTitles(
  dbPath: string | null = resolveCursorGlobalStateDbPath(),
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (!dbPath) {
    return titles;
  }

  try {
    fs.accessSync(dbPath);
  } catch {
    return titles;
  }

  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });

    try {
      const rows = db.prepare(`
        SELECT composerId AS composerId, json_extract(value, '$.name') AS name
        FROM composerHeaders
        WHERE (isSubagent IS NULL OR isSubagent = 0)
          AND json_extract(value, '$.name') IS NOT NULL
          AND trim(json_extract(value, '$.name')) != ''
      `).all() as Array<{ composerId?: string; name?: string }>;

      for (const row of rows) {
        const composerId = typeof row.composerId === 'string' ? row.composerId.trim() : '';
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        if (composerId && name) {
          titles.set(composerId, name);
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // Cursor may be writing to the DB while we read; skip and retry on the next sync.
  }

  return titles;
}
