import { loadDb, saveDb } from '../db';
import { canManageAccounts, nextId, pickFields, pushAudit } from '../domain';
import { generateTemporaryPassword, hashPassword } from '../password';
import { BASE, authUser } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { ROLES } from '@/shared/lib/enums';
import { roleLabels } from '@/shared/lib/meta';
import { fullName } from '@/shared/lib/utils';
import type { CreateUserPayload, CreateUserResponse, User } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const userHandlers = [
  http.get(`${BASE}/users`, ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (actor.role !== 'admin') return forbidden();
    return HttpResponse.json(db.users);
  }),

  http.get(`${BASE}/users/by-employee/:employeeId`, ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (!canManageAccounts(actor.role)) return forbidden();
    const user = db.users.find((item) => item.employeeId === params.employeeId) ?? null;
    return HttpResponse.json(user);
  }),

  http.post(`${BASE}/users`, async ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (!canManageAccounts(actor.role)) return forbidden();

    const body = (await request.json()) as CreateUserPayload;
    const role = body.role ?? 'employee';
    if (!ROLES.includes(role)) {
      return badRequest('Некорректная роль пользователя');
    }
    if (actor.role === 'hr' && role !== 'employee') {
      return forbidden('HR может создавать только учётные записи сотрудников');
    }
    if (!body.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return badRequest('Укажите корректный email для входа');
    }

    const email = body.email.trim().toLowerCase();
    if (db.users.some((item) => item.email.toLowerCase() === email)) {
      return badRequest('Пользователь с таким email уже существует');
    }

    const employee = body.employeeId
      ? db.employees.find((item) => item.id === body.employeeId)
      : null;
    if (body.employeeId && !employee) return notFound('Сотрудник не найден');
    if (employee && employee.status === 'dismissed') {
      return badRequest('Нельзя создать доступ уволенному сотруднику');
    }
    if (employee && db.users.some((item) => item.employeeId === employee.id)) {
      return badRequest('У этого сотрудника уже есть учётная запись');
    }

    const temporaryPassword = generateTemporaryPassword();
    const user: User = {
      id: nextId('u', db.users),
      email,
      name: body.name?.trim() || (employee ? fullName(employee) : email.split('@')[0]),
      role,
      employeeId: employee?.id ?? null,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: null,
    };
    db.users.push(user);
    db.passwordHashes[user.id] = hashPassword(temporaryPassword, user.id);
    pushAudit(
      db,
      actor,
      'Создана учётная запись',
      'user',
      user.id,
      `${user.email} · ${roleLabels[user.role]}${employee ? ` · ${fullName(employee)}` : ''}`,
    );
    saveDb(db);

    const response: CreateUserResponse = { user, temporaryPassword };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.patch(`${BASE}/users/:id`, async ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (actor.role !== 'admin') return forbidden();

    const body = (await request.json()) as Partial<Pick<User, 'role' | 'isActive'>>;
    const user = db.users.find((item) => item.id === params.id);
    if (!user) return notFound();
    if (body.role !== undefined && !ROLES.includes(body.role)) {
      return badRequest('Некорректная роль пользователя');
    }
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      return badRequest('Некорректное значение блокировки');
    }
    if (user.id === actor.id && body.isActive === false) {
      return badRequest('Нельзя заблокировать собственную учётную запись');
    }
    const activeAdmins = db.users.filter(
      (item) => item.role === 'admin' && item.isActive,
    ).length;
    const losesAdmin =
      user.role === 'admin' &&
      user.isActive &&
      ((body.role !== undefined && body.role !== 'admin') || body.isActive === false);
    if (losesAdmin && activeAdmins <= 1) {
      return badRequest('В системе должен остаться хотя бы один активный администратор');
    }
    Object.assign(user, pickFields(body, ['role', 'isActive'] as const));
    pushAudit(db, actor, 'Изменён пользователь', 'user', user.id, user.email);
    saveDb(db);
    return HttpResponse.json(user);
  }),
];
