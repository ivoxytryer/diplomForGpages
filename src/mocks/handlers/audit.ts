import { loadDb } from '../db';
import { BASE, authUser } from './context';
import { forbidden, unauthorized } from './http';
import { can } from '@/shared/lib/permissions';
import { HttpResponse, http } from 'msw';

export const auditHandlers = [
  http.get(`${BASE}/audit`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'audit:read')) return forbidden('Недостаточно прав');
    return HttpResponse.json([...db.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200));
  }),
];
