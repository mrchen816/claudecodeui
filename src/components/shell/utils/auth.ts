import type { ProjectSession } from '../../../types/app';

export function getSessionDisplayName(session: ProjectSession | null | undefined): string | null {
  if (!session) {
    return null;
  }

  // Match sidebar / main header: renamed titles live on `summary` (custom_name).
  const title = String(session.summary || session.name || '').trim();
  if (title) {
    return title;
  }

  return session.__provider === 'cursor' ? 'Untitled Session' : 'New Session';
}
