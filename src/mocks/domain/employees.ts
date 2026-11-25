import { fullName } from '@/shared/lib/utils';
import type { Db } from '@/shared/types';
import { positionDepartmentProblem } from './positions';

export function checkPositionForDepartment(db: Db, departmentId: string, positionId: string) {
  return positionDepartmentProblem(db.positions, departmentId, positionId);
}

export function scoreEmployees(db: Db, params: URLSearchParams) {
  const search = params.get('search')?.trim().toLowerCase() ?? '';
  const departmentId = params.get('departmentId') ?? '';
  const positionId = params.get('positionId') ?? '';
  const status = params.get('status') ?? '';
  const projectId = params.get('projectId') ?? '';

  let items = [...db.employees];

  if (search) {
    items = items.filter((employee) =>
      [
        fullName(employee),
        employee.email,
        employee.personnelNumber,
        employee.phone,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }
  if (departmentId) items = items.filter((employee) => employee.departmentId === departmentId);
  if (positionId) items = items.filter((employee) => employee.positionId === positionId);
  if (status) items = items.filter((employee) => employee.status === status);
  if (projectId) {
    const ids = new Set(
      db.assignments
        .filter((assignment) => assignment.projectId === projectId)
        .map((assignment) => assignment.employeeId),
    );
    items = items.filter((employee) => ids.has(employee.id));
  }

  const sortBy = params.get('sortBy') ?? 'name';
  const sortDir = params.get('sortDir') === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    if (sortBy === 'hireDate') return String(a.hireDate ?? '').localeCompare(String(b.hireDate ?? '')) * sortDir;
    if (sortBy === 'salary') return (a.salary - b.salary) * sortDir;
    return fullName(a).localeCompare(fullName(b), 'ru') * sortDir;
  });

  return items;
}
