import { loadDb, saveDb } from '../db';
import { canReadEmployee, dataScopeEmployeeIds, nextId, pushAudit, vacationBalanceView } from '../domain';
import { BASE, authUser, str } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { fullName } from '@/shared/lib/utils';
import { HttpResponse, http } from 'msw';

export const vacationHandlers = [
  http.get(`${BASE}/vacations/balance`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const year = Number(str(url, 'year') ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return badRequest('Некорректный год');
    }
    const employeeId = str(url, 'employeeId');
    const allowed = dataScopeEmployeeIds(db, user);
    const employeeIds = employeeId
      ? canReadEmployee(db, user, employeeId)
        ? [employeeId]
        : null
      : db.employees
          .filter((employee) => allowed.has(employee.id) && employee.status !== 'dismissed')
          .map((employee) => employee.id);
    if (employeeIds === null) return forbidden('Нет доступа к остаткам отпуска сотрудника');
    return HttpResponse.json(
      employeeIds.map((id) => vacationBalanceView(db, id, year)),
    );
  }),

  http.patch(`${BASE}/vacations/balance/:employeeId`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role !== 'admin' && user.role !== 'hr') {
      return forbidden('Остатки отпусков меняют HR или администратор');
    }
    const employee = db.employees.find((item) => item.id === params.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    const body = (await request.json()) as {
      year?: number;
      entitlement?: number;
      carryover?: number;
    };
    const year = body.year ?? new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return badRequest('Некорректный год');
    }
    const entitlement = body.entitlement ?? 28;
    const carryover = body.carryover ?? 0;
    if (!Number.isFinite(entitlement) || entitlement < 0 || entitlement > 365) {
      return badRequest('Положенные дни должны быть от 0 до 365');
    }
    if (!Number.isFinite(carryover) || carryover < 0 || carryover > 365) {
      return badRequest('Перенос должен быть от 0 до 365');
    }
    let balance = db.vacationBalances.find(
      (item) => item.employeeId === employee.id && item.year === year,
    );
    if (!balance) {
      balance = {
        id: nextId('vb', db.vacationBalances),
        employeeId: employee.id,
        year,
        entitlement,
        carryover,
        updatedAt: new Date().toISOString(),
      };
      db.vacationBalances.push(balance);
    } else {
      balance.entitlement = entitlement;
      balance.carryover = carryover;
      balance.updatedAt = new Date().toISOString();
    }
    pushAudit(
      db,
      user,
      'Изменён остаток отпуска',
      'vacation',
      `${employee.id}|${year}`,
      `${fullName(employee)} · положено ${entitlement} · перенос ${carryover}`,
    );
    saveDb(db);
    return HttpResponse.json(vacationBalanceView(db, employee.id, year));
  }),
];
