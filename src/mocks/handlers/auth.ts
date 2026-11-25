import { loadDb, saveDb } from '../db';
import { pushAudit } from '../domain';
import { hashPassword, verifyPassword } from '../password';
import { BASE, authUser } from './context';
import { badRequest, unauthorized } from './http';
import type { ChangePasswordPayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const authHandlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const db = loadDb();
    const user = db.users.find((item) => item.email.toLowerCase() === body.email?.toLowerCase());
    if (!user || !verifyPassword(body.password ?? '', db.passwordHashes[user.id])) {
      return HttpResponse.json({ detail: 'Неверный email или пароль' }, { status: 401 });
    }
    if (!user.isActive) {
      return HttpResponse.json({ detail: 'Пользователь заблокирован' }, { status: 403 });
    }
    user.lastLoginAt = new Date().toISOString();
    saveDb(db);
    return HttpResponse.json({ token: `mock-${user.id}`, user });
  }),

  http.get(`${BASE}/auth/me`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    return HttpResponse.json(user);
  }),

  http.post(`${BASE}/auth/change-password`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');

    const body = (await request.json()) as ChangePasswordPayload;
    if (!verifyPassword(body.currentPassword ?? '', db.passwordHashes[user.id])) {
      return badRequest('Текущий пароль указан неверно');
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return badRequest('Новый пароль должен содержать не менее 8 символов');
    }
    if (body.newPassword === body.currentPassword) {
      return badRequest('Новый пароль должен отличаться от текущего');
    }

    db.passwordHashes[user.id] = hashPassword(body.newPassword, user.id);
    user.mustChangePassword = false;
    pushAudit(db, user, 'Изменён пароль', 'auth', user.id, user.email);
    saveDb(db);
    return HttpResponse.json(user);
  }),
];
