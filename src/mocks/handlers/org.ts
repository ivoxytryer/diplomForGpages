import { loadDb } from '../db';
import { buildOrgTree, managerScopeDepartmentIds } from '../domain';
import { BASE, authUser } from './context';
import { forbidden, unauthorized } from './http';
import type { OrgStructureResponse } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const orgHandlers = [
  http.get(`${BASE}/org/structure`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'employee') {
      return forbidden('Орг-структура недоступна сотруднику');
    }

    const allowedDepartmentIds =
      user.role === 'manager' && user.employeeId
        ? managerScopeDepartmentIds(db, user.employeeId)
        : undefined;

    const roots = buildOrgTree({
      departments: db.departments,
      employees: db.employees,
      positions: db.positions,
      allowedDepartmentIds,
    });
    const totalEmployees = db.employees.filter(
      (employee) =>
        employee.status !== 'dismissed' &&
        (!allowedDepartmentIds || allowedDepartmentIds.has(employee.departmentId)),
    ).length;

    const data: OrgStructureResponse = { roots, totalEmployees };
    return HttpResponse.json(data);
  }),
];
