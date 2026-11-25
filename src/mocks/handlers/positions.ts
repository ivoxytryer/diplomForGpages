import { loadDb, saveDb } from '../db';
import { nextId, pickFields, positionFields, pushAudit } from '../domain';
import { BASE, authUser } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { can } from '@/shared/lib/permissions';
import type { Position, PositionPayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const positionHandlers = [
  http.get(`${BASE}/positions`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'admin' || user.role === 'hr') {
      return HttpResponse.json(db.positions);
    }
    return HttpResponse.json(
      db.positions.map(({ salaryMin: _salaryMin, salaryMax: _salaryMax, ...position }) => position),
    );
  }),

  http.post(`${BASE}/positions`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as PositionPayload;
    if (body.salaryMin > body.salaryMax) {
      return badRequest('Минимальный оклад не может быть больше максимального');
    }
    if (!body.name?.trim() || !body.family?.trim()) {
      return badRequest('Укажите название и профессиональную ветку');
    }
    if (!db.departments.some((item) => item.id === body.departmentId)) {
      return badRequest('Подразделение не найдено');
    }
    if (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 4) {
      return badRequest('Грейд должен быть от 1 до 4');
    }
    const position: Position = {
      ...pickFields(body, positionFields),
      id: nextId('p', db.positions),
    };
    db.positions.push(position);
    pushAudit(db, user, 'Создана должность', 'position', position.id, position.name);
    saveDb(db);
    return HttpResponse.json(position, { status: 201 });
  }),

  http.patch(`${BASE}/positions/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<PositionPayload>;
    const position = db.positions.find((item) => item.id === params.id);
    if (!position) return notFound();
    if (
      user.role !== 'admin' &&
      (body.salaryMin !== undefined || body.salaryMax !== undefined)
    ) {
      return forbidden('Вилку оклада изменяет администратор');
    }
    const nextDepartmentId = body.departmentId ?? position.departmentId;
    if (
      nextDepartmentId !== position.departmentId &&
      db.employees.some((employee) => employee.positionId === position.id)
    ) {
      return badRequest('Должность занята сотрудниками — сначала оформите перевод');
    }
    const salaryMin = body.salaryMin ?? position.salaryMin;
    const salaryMax = body.salaryMax ?? position.salaryMax;
    if (salaryMin > salaryMax) {
      return badRequest('Минимальный оклад не может быть больше максимального');
    }
    const departmentId = body.departmentId ?? position.departmentId;
    if (!db.departments.some((item) => item.id === departmentId)) {
      return badRequest('Подразделение не найдено');
    }
    const grade = body.grade ?? position.grade;
    if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
      return badRequest('Грейд должен быть от 1 до 4');
    }
    if (body.family !== undefined && !body.family.trim()) {
      return badRequest('Укажите профессиональную ветку');
    }
    Object.assign(position, pickFields(body, positionFields));
    pushAudit(db, user, 'Изменена должность', 'position', position.id, position.name);
    saveDb(db);
    return HttpResponse.json(position);
  }),

  http.delete(`${BASE}/positions/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const position = db.positions.find((item) => item.id === params.id);
    if (!position) return notFound();
    if (db.employees.some((employee) => employee.positionId === position.id)) {
      return badRequest('Должность занята сотрудниками');
    }
    db.positions = db.positions.filter((item) => item.id !== position.id);
    pushAudit(db, user, 'Удалена должность', 'position', position.id, position.name);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
