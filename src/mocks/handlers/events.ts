import { loadDb, saveDb } from '../db';
import {
  archiveEmployee,
  canReadEmployee,
  dataScopeEmployeeIds,
  dismissalBlocker,
  nextId,
  pushAudit,
  restoreEmployee,
  validatePromotion,
  validateTransfer,
} from '../domain';
import { BASE, authUser, str } from './context';
import { badRequest, forbidden, notFound, ruleResponse, unauthorized } from './http';
import { HR_EVENT_TYPES } from '@/shared/lib/enums';
import { can } from '@/shared/lib/permissions';
import { isValidDateString } from '@/shared/lib/utils';
import type { HrEvent, HrEventPayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const eventHandlers = [
  http.get(`${BASE}/events`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const month = str(url, 'month');
    const type = str(url, 'type');
    const allowed = dataScopeEmployeeIds(db, user);
    let items = db.events.filter((event) => allowed.has(event.employeeId));
    if (employeeId) {
      if (!canReadEmployee(db, user, employeeId)) {
        return forbidden('Нет доступа к событиям сотрудника');
      }
      items = items.filter((item) => item.employeeId === employeeId);
    }
    if (month) items = items.filter((item) => String(item.date ?? '').startsWith(month));
    if (type) items = items.filter((item) => item.type === type);
    items.sort(
      (a, b) =>
        String(b.date ?? '').localeCompare(String(a.date ?? '')) ||
        b.id.localeCompare(a.id, undefined, { numeric: true }),
    );
    // Оклад своего сотрудника видит он сам; чужие оклады скрываем.
    items = items.map((event) => {
      if (
        user.role === 'admin' ||
        user.role === 'hr' ||
        user.employeeId === event.employeeId
      ) {
        return event;
      }
      const rest = { ...event };
      delete rest.oldSalary;
      delete rest.newSalary;
      return rest;
    });
    return HttpResponse.json(items);
  }),

  http.post(`${BASE}/events`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'events:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as HrEventPayload;
    if (
      user.role === 'hr' &&
      user.employeeId === body.employeeId &&
      (body.type === 'promotion' || body.type === 'transfer')
    ) {
      return forbidden('HR не может оформлять повышение или перевод самому себе');
    }
    if (body.type === 'dismissal' && !can(user.role, 'employees:dismiss')) {
      return forbidden('Увольнение доступно администратору');
    }
    if (!HR_EVENT_TYPES.includes(body.type)) {
      return badRequest('Некорректный тип кадрового события');
    }
    if (!isValidDateString(body.date)) {
      return badRequest('Укажите корректную дату события');
    }
    if (!body.title?.trim()) {
      return badRequest('Укажите название события');
    }
    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (body.type === 'hire' && employee.status !== 'dismissed') {
      return badRequest('Приём доступен только для уволенного сотрудника');
    }
    if (body.type === 'hire' && employee.status === 'dismissed' && !can(user.role, 'employees:dismiss')) {
      return forbidden('Повторный приём уволенного сотрудника доступен администратору');
    }
    if (body.type === 'dismissal') {
      const blocker = dismissalBlocker(db, employee.id);
      if (blocker) return badRequest(blocker);
    }
    const currentPosition = db.positions.find((item) => item.id === employee.positionId);
    const canWriteSalary = can(user.role, 'salary:write');

    let eventSalary = body.newSalary ?? null;
    let promotionPosition: (typeof db.positions)[number] | null = null;

    if (body.type === 'promotion') {
      const decision = validatePromotion({
        employee,
        positions: db.positions,
        toPositionId: body.toPositionId,
        newSalary: body.newSalary,
        canWriteSalary,
      });
      if (!decision.ok) return ruleResponse(decision.error);
      promotionPosition = decision.value.position;
      eventSalary = decision.value.salary;
    } else if (body.type === 'salary_change') {
      if (!canWriteSalary) {
        return forbidden('Изменение оклада доступно администратору');
      }
      if (body.newSalary === null || body.newSalary === undefined) {
        return badRequest('Укажите новый оклад');
      }
      eventSalary = body.newSalary;
    } else if (
      body.newSalary !== null &&
      body.newSalary !== undefined &&
      body.newSalary !== employee.salary &&
      !canWriteSalary
    ) {
      return forbidden('Оклад устанавливает администратор');
    }
    if (eventSalary !== null && (!Number.isFinite(eventSalary) || eventSalary < 0)) {
      return badRequest('Некорректный размер оклада');
    }
    const salaryPosition =
      promotionPosition ??
      (body.type === 'salary_change' ? currentPosition : null) ??
      (body.toPositionId
        ? db.positions.find((item) => item.id === body.toPositionId) ?? null
        : null);
    if (
      eventSalary !== null &&
      salaryPosition &&
      (eventSalary < salaryPosition.salaryMin || eventSalary > salaryPosition.salaryMax)
    ) {
      return badRequest('Оклад выходит за вилку должности');
    }
    if (body.type === 'transfer') {
      const decision = validateTransfer({
        employee,
        positions: db.positions,
        toDepartmentId: body.toDepartmentId,
        toPositionId: body.toPositionId,
      });
      if (!decision.ok) return ruleResponse(decision.error);
    }

    const event: HrEvent = {
      id: nextId('ev', db.events),
      employeeId: body.employeeId,
      type: body.type,
      date: body.date,
      title: body.title.trim(),
      description: body.description,
      toDepartmentId: body.toDepartmentId ?? null,
      toPositionId: body.toPositionId ?? null,
      fromDepartmentId: employee.departmentId,
      fromPositionId: employee.positionId,
      oldSalary: employee.salary,
      newSalary: eventSalary,
      authorId: user.employeeId ?? null,
    };

    if (body.type === 'transfer') {
      if (body.toDepartmentId) employee.departmentId = body.toDepartmentId;
      if (body.toPositionId) employee.positionId = body.toPositionId;
    }
    if (body.type === 'promotion' && promotionPosition) {
      employee.positionId = promotionPosition.id;
      if (eventSalary !== null) employee.salary = eventSalary;
    }
    if (body.type === 'salary_change' && eventSalary !== null) {
      employee.salary = eventSalary;
    }
    if (body.type === 'dismissal') {
      archiveEmployee(db, employee, body.date, user);
    }
    if (body.type === 'hire') {
      employee.status = 'active';
      employee.hireDate = body.date;
      // Повторный приём после увольнения: сбрасываем дату увольнения
      // и возвращаем доступ к системе.
      restoreEmployee(db, employee, user);
    }

    db.events.push(event);
    const fromPositionName =
      db.positions.find((item) => item.id === event.fromPositionId)?.name ?? '—';
    const auditDetails =
      body.type === 'promotion' && promotionPosition
        ? `${event.title} · ${fromPositionName} → ${promotionPosition.name}`
        : event.title;
    pushAudit(db, user, 'Создано кадровое событие', 'event', event.id, auditDetails);
    saveDb(db);
    return HttpResponse.json(event, { status: 201 });
  }),
];
