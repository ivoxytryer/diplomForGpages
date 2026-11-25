import { loadDb, saveDb } from '../db';
import { createsDepartmentCycle, departmentFields, nextId, pickFields, pushAudit } from '../domain';
import { BASE, authUser } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { can } from '@/shared/lib/permissions';
import type { Department, DepartmentPayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const departmentHandlers = [
  http.get(`${BASE}/departments`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    return HttpResponse.json(db.departments);
  }),

  http.post(`${BASE}/departments`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as DepartmentPayload;
    const department: Department = {
      ...pickFields(body, departmentFields),
      id: nextId('d', db.departments),
    };
    db.departments.push(department);
    pushAudit(db, user, 'Создано подразделение', 'department', department.id, department.name);
    saveDb(db);
    return HttpResponse.json(department, { status: 201 });
  }),

  http.patch(`${BASE}/departments/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<DepartmentPayload>;
    const department = db.departments.find((item) => item.id === params.id);
    if (!department) return notFound();
    if (body.parentId && createsDepartmentCycle(db.departments, department.id, body.parentId)) {
      return badRequest('Нельзя выбрать дочернее подразделение в качестве родительского');
    }
    Object.assign(department, pickFields(body, departmentFields));
    pushAudit(db, user, 'Изменено подразделение', 'department', department.id, department.name);
    saveDb(db);
    return HttpResponse.json(department);
  }),

  http.delete(`${BASE}/departments/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const department = db.departments.find((item) => item.id === params.id);
    if (!department) return notFound();
    if (db.employees.some((employee) => employee.departmentId === department.id)) {
      return badRequest('В подразделении есть сотрудники');
    }
    if (db.positions.some((position) => position.departmentId === department.id)) {
      return badRequest('В подразделении есть должности');
    }
    if (db.departments.some((item) => item.parentId === department.id)) {
      return badRequest('Есть дочерние подразделения');
    }
    db.departments = db.departments.filter((item) => item.id !== department.id);
    pushAudit(db, user, 'Удалено подразделение', 'department', department.id, department.name);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
