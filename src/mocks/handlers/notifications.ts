import { loadDb, saveDb } from '../db';
import { BASE, authUser } from './context';
import { notFound, unauthorized } from './http';
import { HttpResponse, http } from 'msw';

export const notificationHandlers = [
  http.get(`${BASE}/notifications`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const items = db.notifications
      .filter((notification) => notification.userId === user.id)
      .filter((notification) => !unreadOnly || !notification.readAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(items);
  }),

  http.patch(`${BASE}/notifications/read-all`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const at = new Date().toISOString();
    db.notifications.forEach((notification) => {
      if (notification.userId === user.id && !notification.readAt) {
        notification.readAt = at;
      }
    });
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

  http.patch(`${BASE}/notifications/:id/read`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const notification = db.notifications.find(
      (item) => item.id === params.id && item.userId === user.id,
    );
    if (!notification) return notFound('Уведомление не найдено');
    notification.readAt = new Date().toISOString();
    saveDb(db);
    return HttpResponse.json(notification);
  }),
];
