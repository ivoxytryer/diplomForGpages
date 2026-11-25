import { loadDb, saveDb } from '../db';
import { canReadEmployee, checkPositionForDepartment, employeeFields, nextId, personalEmployeeFields, pickFields, pushAudit, redactSalary, scopeEmployeeIds, scoreEmployees } from '../domain';
import { BASE, authUser } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { EMPLOYEE_STATUSES } from '@/shared/lib/enums';
import { can } from '@/shared/lib/permissions';
import { fullName } from '@/shared/lib/utils';
import type { Employee, EmployeePayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const employeeHandlers = [
  http.get(`${BASE}/employees`, ({ request }) => {
    const db = loadDb();
    const viewer = authUser(request, db);
    if (!viewer) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.max(1, Math.min(500, Number(url.searchParams.get('pageSize') ?? 20)));
    const allowed = scopeEmployeeIds(db, viewer);
    const items = scoreEmployees(db, url.searchParams).filter((employee) =>
      allowed.has(employee.id),
    );
    const total = items.length;
    const paged = items
      .slice((page - 1) * pageSize, page * pageSize)
      .map((employee) => redactSalary(employee, viewer));
    return HttpResponse.json({ items: paged, total, page, pageSize });
  }),

  http.get(`${BASE}/employees/:id`, ({ params, request }) => {
    const db = loadDb();
    const viewer = authUser(request, db);
    if (!viewer) return unauthorized('Сессия истекла');
    const employee = db.employees.find((item) => item.id === params.id);
    if (!employee) return notFound('Сотрудник не найден');
    if (!canReadEmployee(db, viewer, employee.id)) {
      return forbidden('Нет доступа к карточке сотрудника');
    }
    const manager = employee.managerId
      ? db.employees.find((item) => item.id === employee.managerId)
      : null;
    return HttpResponse.json({
      ...redactSalary(employee, viewer),
      managerName: manager ? fullName(manager) : null,
    });
  }),

  http.post(`${BASE}/employees`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'employees:write')) {
      return forbidden('Недостаточно прав для изменения карточек сотрудников');
    }
    const body = (await request.json()) as EmployeePayload;
    if (body.status !== undefined && !EMPLOYEE_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус сотрудника');
    }
    if (body.status === 'dismissed' && !can(user.role, 'employees:dismiss')) {
      return forbidden('Создавать уволенных сотрудников может только администратор');
    }
    if (!body.email?.trim()) return badRequest('Укажите email сотрудника');
    if (
      db.employees.some(
        (employee) => employee.email.toLowerCase() === body.email.trim().toLowerCase(),
      )
    ) {
      return badRequest('Сотрудник с таким email уже существует');
    }
    if (body.managerId) {
      const manager = db.employees.find((item) => item.id === body.managerId);
      if (!manager) return badRequest('Руководитель не найден');
      if (manager.status === 'dismissed') return badRequest('Руководитель уволен');
    }
    const positionProblem = checkPositionForDepartment(
      db,
      body.departmentId,
      body.positionId,
    );
    if (positionProblem) return badRequest(positionProblem);
    const position = db.positions.find((item) => item.id === body.positionId);
    if (
      position &&
      body.salary > 0 &&
      (body.salary < position.salaryMin || body.salary > position.salaryMax)
    ) {
      return badRequest('Оклад выходит за вилку должности');
    }
    const employee: Employee = {
      ...pickFields(body, employeeFields),
      salary: can(user.role, 'salary:write') ? (body.salary ?? 0) : 0,
      id: nextId('e', db.employees),
      personnelNumber: String(
        db.employees.reduce((max, item) => Math.max(max, Number(item.personnelNumber) || 0), 0) + 1,
      ).padStart(4, '0'),
    };
    db.employees.push(employee);
    db.events.push({
      id: nextId('ev', db.events),
      employeeId: employee.id,
      type: 'hire',
      date: employee.hireDate,
      title: 'Приём на работу',
      description: 'Карточка сотрудника создана',
      toDepartmentId: employee.departmentId,
      toPositionId: employee.positionId,
      authorId: user.employeeId ?? null,
    });
    pushAudit(db, user, 'Добавлен сотрудник', 'employee', employee.id, fullName(employee));
    saveDb(db);
    return HttpResponse.json(employee, { status: 201 });
  }),

  http.patch(`${BASE}/employees/:id`, async ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');
    if (!can(actor.role, 'employees:write')) {
      return forbidden('Недостаточно прав для изменения карточек сотрудников');
    }
    const body = (await request.json()) as Partial<EmployeePayload>;
    const employee = db.employees.find((item) => item.id === params.id);
    if (!employee) return notFound('Сотрудник не найден');
    if (body.status !== undefined && !EMPLOYEE_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус сотрудника');
    }
    if (
      body.email !== undefined &&
      db.employees.some(
        (item) =>
          item.id !== employee.id &&
          item.email.toLowerCase() === body.email!.trim().toLowerCase(),
      )
    ) {
      return badRequest('Сотрудник с таким email уже существует');
    }
    const orgFields = [
      'departmentId',
      'positionId',
      'managerId',
      'hireDate',
      'status',
      'salary',
    ] as const;
    if (orgFields.some((field) => body[field] !== undefined && body[field] !== employee[field])) {
      return badRequest(
        'Подразделение, должность, руководитель, оклад и статус меняются кадровым событием',
      );
    }
    if (body.email !== undefined && !body.email.trim()) {
      return badRequest('Email не может быть пустым');
    }
    if (body.email !== undefined) body.email = body.email.trim();

    // Если учётка использовала email из карточки, синхронизируем его.
    // Если у аккаунта был отдельный логин, его не трогаем.
    const linkedUser = db.users.find((item) => item.employeeId === employee.id);
    if (
      body.email &&
      linkedUser &&
      linkedUser.email.toLowerCase() === employee.email.toLowerCase()
    ) {
      const taken = db.users.some(
        (item) =>
          item.id !== linkedUser.id &&
          item.email.toLowerCase() === body.email!.toLowerCase(),
      );
      if (taken) return badRequest('Этот email уже используется для входа');
      linkedUser.email = body.email;
    }

    Object.assign(employee, pickFields(body, personalEmployeeFields));
    pushAudit(db, actor, 'Изменена карточка сотрудника', 'employee', employee.id, fullName(employee));
    saveDb(db);
    return HttpResponse.json(employee);
  }),

  http.delete(`${BASE}/employees/:id`, ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');
    if (!can(actor.role, 'employees:delete')) {
      return forbidden('Удалять сотрудников может только администратор');
    }
    const employee = db.employees.find((item) => item.id === params.id);
    if (!employee) return notFound('Сотрудник не найден');
    if (actor.employeeId === employee.id) {
      return badRequest('Нельзя удалить собственную карточку сотрудника');
    }
    db.employees = db.employees
      .filter((item) => item.id !== employee.id)
      .map((item) => (item.managerId === employee.id ? { ...item, managerId: null } : item));
    db.departments = db.departments.map((item) =>
      item.headId === employee.id ? { ...item, headId: null } : item,
    );
    db.projects = db.projects.map((item) =>
      item.managerId === employee.id ? { ...item, managerId: null } : item,
    );
    db.assignments = db.assignments.filter((item) => item.employeeId !== employee.id);
    db.projectTasks = db.projectTasks.filter((item) => item.employeeId !== employee.id);
    const absenceIds = new Set(
      db.absences.filter((item) => item.employeeId === employee.id).map((item) => item.id),
    );
    db.absences = db.absences.filter((item) => item.employeeId !== employee.id);
    db.absenceTaskDecisions = db.absenceTaskDecisions.filter(
      (item) => !absenceIds.has(item.absenceId),
    );
    db.events = db.events.filter((item) => item.employeeId !== employee.id);
    db.vacationBalances = db.vacationBalances.filter(
      (item) => item.employeeId !== employee.id,
    );
    const linkedUserIds = new Set(
      db.users.filter((item) => item.employeeId === employee.id).map((item) => item.id),
    );
    db.notifications = db.notifications.filter(
      (item) =>
        !linkedUserIds.has(item.userId) &&
        !(item.link ?? '').includes(`/employees/${employee.id}`),
    );
    const timesheetPrefix = `${employee.id}|`;
    db.timesheetOverrides = Object.fromEntries(
      Object.entries(db.timesheetOverrides).filter(([key]) => !key.startsWith(timesheetPrefix)),
    );
    db.timesheetStatuses = Object.fromEntries(
      Object.entries(db.timesheetStatuses).filter(([key]) => !key.startsWith(timesheetPrefix)),
    );
    db.users = db.users.map((item) =>
      item.employeeId === employee.id ? { ...item, employeeId: null, isActive: false } : item,
    );
    pushAudit(db, actor, 'Удалён сотрудник', 'employee', employee.id, fullName(employee));
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
