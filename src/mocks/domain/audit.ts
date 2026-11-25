import { nextId } from './ids';
import type { AuditEntry, Db, User } from '@/shared/types';

export function pushAudit(
  db: Db,
  user: User | null,
  action: string,
  entity: string,
  entityId: string,
  details?: string,
) {
  const entry: AuditEntry = {
    id: nextId('au', db.audit),
    at: new Date().toISOString(),
    userId: user?.id ?? 'system',
    userName: user?.name ?? 'Система',
    action,
    entity,
    entityId,
    details,
  };
  db.audit.push(entry);
  db.audit.sort((a, b) => a.at.localeCompare(b.at));
  if (db.audit.length > 200) db.audit = db.audit.slice(-200);
}
