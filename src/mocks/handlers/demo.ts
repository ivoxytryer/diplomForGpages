import { loadDb, resetDb } from '../db';
import { BASE, authUser } from './context';
import { forbidden, unauthorized } from './http';
import { HttpResponse, http } from 'msw';

export const demoHandlers = [
  http.post(`${BASE}/demo/reset`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role !== 'admin') return forbidden('Недостаточно прав');
    resetDb();
    return HttpResponse.json({ ok: true });
  }),
];
