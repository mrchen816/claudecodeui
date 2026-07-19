import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { sessionsDb } from '@/modules/database/index.js';
import {
  extractFirstValidJsonlData,
  findFilesRecursivelyCreatedAfter,
  normalizeSessionName,
  readFileTimestamps,
} from '@/shared/utils.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';

type ParsedSession = {
  sessionId: string;
  projectPath: string;
  sessionName?: string;
};

/**
 * Reconstructs an absolute workspace path from a Cursor project folder name.
 *
 * Cursor encodes paths by replacing non-alphanumeric characters with `-`,
 * which is lossy when folder names themselves contain dashes or spaces. This
 * decoder walks the encoded tokens left-to-right and greedily forms the
 * longest existing path prefix at each step.
 */
function decodeProjectPathFromCursorProjectDir(projectDir: string): string | null {
  const folderName = path.basename(projectDir).trim();
  if (!folderName) {
    return null;
  }

  const tokens = folderName.split('-').filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  let currentPath = '';
  let index = 0;

  while (index < tokens.length) {
    let matched = false;

    for (let end = tokens.length; end > index; end -= 1) {
      const segment = tokens.slice(index, end).join('-');
      const candidate = currentPath ? `${currentPath}/${segment}` : `/${segment}`;

      try {
        fs.accessSync(candidate);
        currentPath = candidate;
        index = end;
        matched = true;
        break;
      } catch {
        // Try a shorter segment so dashes inside folder names are preserved.
      }
    }

    if (!matched) {
      return null;
    }
  }

  return currentPath || null;
}

/**
 * Resolves the Cursor project root directory for one transcript file.
 */
function resolveCursorProjectDir(filePath: string): string {
  const normalizedParts = path.normalize(filePath).split(path.sep);
  const agentTranscriptsIndex = normalizedParts.lastIndexOf('agent-transcripts');
  if (agentTranscriptsIndex > 0) {
    return normalizedParts.slice(0, agentTranscriptsIndex).join(path.sep);
  }

  return path.dirname(filePath);
}

/**
 * Session indexer for Cursor transcript artifacts.
 */
export class CursorSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'cursor' as const;
  private readonly cursorHome = path.join(os.homedir(), '.cursor');

  /**
   * Returns true when a JSONL file is a subagent transcript rather than a
   * top-level session.
   */
  private isSubagentTranscript(filePath: string): boolean {
    return path.normalize(filePath).split(path.sep).includes('subagents');
  }

  /**
   * Scans Cursor chats and upserts discovered sessions into DB.
   */
  async synchronize(since?: Date): Promise<number> {
    const projectsDir = path.join(this.cursorHome, 'projects');

    let processed = 0;

    const files = await findFilesRecursivelyCreatedAfter(projectsDir, '.jsonl', since ?? null);

    for (const filePath of files) {
      if (this.isSubagentTranscript(filePath)) {
        continue;
      }

      const parsed = await this.processSessionFile(filePath);
      if (!parsed) {
        continue;
      }

      const timestamps = await readFileTimestamps(filePath);
      sessionsDb.createSession(
        parsed.sessionId,
        this.provider,
        parsed.projectPath,
        parsed.sessionName,
        timestamps.createdAt,
        timestamps.updatedAt,
        filePath
      );
      processed += 1;
    }

    return processed;
  }

  /**
   * Parses and upserts one Cursor session JSONL file.
   */
  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.jsonl')) {
      return null;
    }
    if (this.isSubagentTranscript(filePath)) {
      return null;
    }

    const parsed = await this.processSessionFile(filePath);
    if (!parsed) {
      return null;
    }

    const timestamps = await readFileTimestamps(filePath);
    return sessionsDb.createSession(
      parsed.sessionId,
      this.provider,
      parsed.projectPath,
      parsed.sessionName,
      timestamps.createdAt,
      timestamps.updatedAt,
      filePath
    );
  }

  /**
   * Extracts project path from Cursor worker.log.
   */
  private async extractProjectPathFromWorkerLog(filePath: string): Promise<string | null> {
    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const lineReader = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of lineReader) {
        const match = line.match(/workspacePath=(.*)$/);
        const projectPath = match?.[1]?.trim();
        if (projectPath) {
          lineReader.close();
          fileStream.close();
          return projectPath;
        }
      }
    } catch {
      // Missing worker logs are valid for partial or incomplete session data.
    }

    return null;
  }

  /**
   * Extracts session metadata from one Cursor JSONL session file.
   */
  private async resolveProjectPath(filePath: string): Promise<string | null> {
    const projectDir = resolveCursorProjectDir(filePath);
    const workerLogPath = path.join(projectDir, 'worker.log');
    const fromWorkerLog = await this.extractProjectPathFromWorkerLog(workerLogPath);
    if (fromWorkerLog) {
      return fromWorkerLog;
    }

    return decodeProjectPathFromCursorProjectDir(projectDir);
  }

  private async processSessionFile(filePath: string): Promise<ParsedSession | null> {
    const sessionId = path.basename(filePath, '.jsonl');
    const projectPath = await this.resolveProjectPath(filePath);

    if (!projectPath) {
      return null;
    }

    return extractFirstValidJsonlData(filePath, (rawData) => {
      const data = rawData as Record<string, any>;
      if (data.role !== 'user') {
        return null;
      }

      const text = typeof data.message?.content?.[0]?.text === 'string' ? data.message.content[0].text : '';
      // Drop Cursor's `<timestamp>…</timestamp>` prefix and `<user_query>` tags
      // so the session name comes from the actual first line the user typed.
      const firstLine = text
        .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, '')
        .replace(/<\/?user_query>/g, '')
        .trim()
        .split('\n')[0];

      return {
        sessionId,
        projectPath,
        sessionName: normalizeSessionName(firstLine, 'Untitled Cursor Session'),
      };
    });
  }
}
