import { nextId } from './ids';
import type { Db, Notification } from '@/shared/types';

export function pushNotification(
  db: Db,
  notification: Omit<Notification, 'id' | 'createdAt' | 'readAt'>,
) {
  db.notifications.push({
    ...notification,
    id: nextId('n', db.notifications),
    createdAt: new Date().toISOString(),
    readAt: null,
  });
}

export function employeeUser(db: Db, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  return db.users.find((user) => user.employeeId === employeeId && user.isActive) ?? null;
}

export function notifyEmployee(db: Db, employeeId: string | null | undefined, payload: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'readAt'>) {
  const user = employeeUser(db, employeeId);
  if (!user) return;
  pushNotification(db, { ...payload, userId: user.id });
}

export function notifyHrAndAdmin(db: Db, payload: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'readAt'>, excludeUserId?: string) {
  db.users
    .filter(
      (user) =>
        user.isActive &&
        user.id !== excludeUserId &&
        (user.role === 'hr' || user.role === 'admin'),
    )
    .forEach((user) => pushNotification(db, { ...payload, userId: user.id }));
}
