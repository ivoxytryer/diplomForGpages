import type { Db, User } from '@/shared/types';

export const BASE = '/api/v1';

export function str(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value && value.length > 0 ? value : undefined;
}

export function authUser(request: Request, db: Db): User | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer mock-')) return null;
  const userId = header.replace('Bearer mock-', '');
  return db.users.find((user) => user.id === userId && user.isActive) ?? null;
}
