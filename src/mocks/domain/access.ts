import { employeeRole, managerScopeDepartmentIds } from './scoping';
import { can, canApproveAbsence } from '@/shared/lib/permissions';
import type { Absence, Db, Employee, Role, User } from '@/shared/types';

/**
 * Оклад видят admin и HR, остальные — только свой.
 * Для остальных поле вырезается из ответа, а не просто прячется в UI.
 */
export function redactSalary(employee: Employee, viewer: User | null): Employee {
  if (!viewer) return employee;
  if (viewer.role === 'admin' || viewer.role === 'hr') return employee;
  if (viewer.employeeId === employee.id) return employee;
  const copy = { ...employee };
  delete (copy as Partial<Employee>).salary;
  return copy;
}

export function canManageAccounts(role: Role) {
  return role === 'admin' || role === 'hr';
}

export function canManageTasks(user: User | null) {
  return user?.role === 'admin' || user?.role === 'manager';
}

export function canApproveAbsenceFor(db: Db, actor: User, absence: Absence) {
  if (!can(actor.role, 'absences:approve')) return false;
  if (actor.role === 'admin') return true;
  if (absence.type === 'sick' && actor.role === 'manager') return false;
  if (actor.employeeId && actor.employeeId === absence.employeeId) return false;

  const requesterRole = employeeRole(db, absence.employeeId);
  if (!canApproveAbsence(actor.role, requesterRole)) return false;

  if (actor.role === 'manager') {
    if (!actor.employeeId) return false;
    const employee = db.employees.find((item) => item.id === absence.employeeId);
    return Boolean(
      employee && managerScopeDepartmentIds(db, actor.employeeId).has(employee.departmentId),
    );
  }

  return actor.role === 'hr';
}

export function canApproveTimesheetFor(db: Db, actor: User, employeeId: string) {
  if (actor.role === 'admin') return true;
  if (actor.employeeId === employeeId) return false;

  const targetRole = employeeRole(db, employeeId);
  if (!canApproveAbsence(actor.role, targetRole)) return false;

  if (actor.role === 'manager') {
    if (!actor.employeeId) return false;
    const employee = db.employees.find((item) => item.id === employeeId);
    return Boolean(
      employee && managerScopeDepartmentIds(db, actor.employeeId).has(employee.departmentId),
    );
  }

  return actor.role === 'hr';
}
