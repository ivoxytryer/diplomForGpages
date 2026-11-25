import { loadDb, saveDb } from '../db';
import { canApproveTimesheetFor, canReadTimesheet, dataScopeEmployeeIds, pushAudit } from '../domain';
import { buildTimesheet } from '../timesheet';
import { BASE, authUser, str } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { getCalendarDay, isWorkingDay } from '@/shared/lib/calendar';
import { TIMESHEET_STATUSES } from '@/shared/lib/enums';
import { timesheetCodes, timesheetStatusMeta } from '@/shared/lib/meta';
import { can } from '@/shared/lib/permissions';
import { formatDate, fullName, isValidDateString, monthKey } from '@/shared/lib/utils';
import type { TimesheetCode, TimesheetStatus } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const timesheetHandlers = [
  http.get(`${BASE}/timesheet`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const month = str(url, 'month') ?? monthKey();
    const departmentId = str(url, 'departmentId');
    const employeeId = str(url, 'employeeId');
    const allowed = dataScopeEmployeeIds(db, user);
    let employees = db.employees.filter((item) => allowed.has(item.id));
    let includeDismissed = false;
    if (departmentId) employees = employees.filter((item) => item.departmentId === departmentId);
    if (employeeId) {
      if (!canReadTimesheet(db, user, employeeId)) {
        return forbidden('Нет доступа к табелю сотрудника');
      }
      employees = employees.filter((item) => item.id === employeeId);
      // История уволенного сотрудника должна оставаться доступной в его карточке.
      includeDismissed = true;
    }
    return HttpResponse.json(buildTimesheet(db, month, employees, includeDismissed));
  }),

  http.patch(`${BASE}/timesheet/:employeeId/status`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'timesheet:approve')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as { month: string; status: TimesheetStatus };
    if (!body.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) {
      return badRequest('Некорректный месяц');
    }
    if (!TIMESHEET_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус табеля');
    }
    const employee = db.employees.find((item) => item.id === params.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (!canApproveTimesheetFor(db, user, String(params.employeeId))) {
      return forbidden(
        'Нельзя утверждать табель сотрудника вне своей зоны ответственности или собственный',
      );
    }
    db.timesheetStatuses[`${params.employeeId}|${body.month}`] = body.status;
    pushAudit(
      db,
      user,
      'Изменён статус табеля',
      'timesheet',
      `${params.employeeId}|${body.month}`,
      timesheetStatusMeta[body.status].label,
    );
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

  http.patch(`${BASE}/timesheet/:employeeId/:date`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'timesheet:edit')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as { code: TimesheetCode; hours: number };
    const date = String(params.date);
    if (!isValidDateString(date)) return badRequest('Некорректная дата');
    const month = date.slice(0, 7);
    const employeeId = String(params.employeeId);
    const employee = db.employees.find((item) => item.id === employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (date < employee.hireDate) {
      return badRequest('Нельзя отмечать дни раньше даты приёма сотрудника');
    }
    if (employee.dismissalDate && date > employee.dismissalDate) {
      return badRequest('Нельзя отмечать дни после увольнения сотрудника');
    }
    if (body.code === '—') {
      return badRequest('Отметку «Вне периода работы» нельзя выставить вручную');
    }
    if (!timesheetCodes.includes(body.code)) {
      return badRequest('Некорректный код отметки табеля');
    }
    if (!Number.isFinite(body.hours) || body.hours < 0 || body.hours > 24) {
      return badRequest('Часы должны быть числом от 0 до 24');
    }
    const calendarDay = getCalendarDay(date);
    if (!isWorkingDay(date) && body.code !== 'В' && user.role !== 'admin') {
      return badRequest(
        `${formatDate(date)} — нерабочий день${calendarDay.name ? ` (${calendarDay.name})` : ''}. Работу в такой день может отметить только администратор`,
      );
    }
    const timesheetStatus = db.timesheetStatuses[`${employeeId}|${month}`];
    const wasApproved = timesheetStatus === 'approved';
    if (wasApproved && user.role !== 'admin') {
      return badRequest('Табель за этот месяц утверждён — правку может внести только администратор');
    }
    const key = `${employeeId}|${month}`;
    const list = db.timesheetOverrides[key] ?? [];
    const existing = list.find((item) => item.date === date);
    if (existing) {
      existing.code = body.code;
      existing.hours = body.hours;
    } else {
      list.push({ date, code: body.code, hours: body.hours });
    }
    db.timesheetOverrides[key] = list;
    pushAudit(
      db,
      user,
      'Изменена отметка табеля',
      'timesheet',
      `${employeeId}|${date}`,
      `${fullName(employee)} · ${date} · ${body.code} · ${body.hours} ч${
        wasApproved ? ' · правка после утверждения' : ''
      }`,
    );
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
