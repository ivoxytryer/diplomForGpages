import { fullName } from '@/shared/lib/utils';
import type { Db, Project, Role, User } from '@/shared/types';

/**
 * Подразделение менеджера + подразделения, где он руководитель, + все дочерние.
 * Так руководитель видит не только свою карточку отдела, но и подчинённую структуру.
 */
export function managerScopeDepartmentIds(db: Db, managerEmployeeId: string) {
  const roots = new Set<string>();
  const own = db.employees.find((employee) => employee.id === managerEmployeeId);
  if (own) roots.add(own.departmentId);
  db.departments.forEach((department) => {
    if (department.headId === managerEmployeeId) roots.add(department.id);
  });

  const result = new Set<string>();
  const visit = (id: string) => {
    if (result.has(id)) return;
    result.add(id);
    db.departments
      .filter((department) => department.parentId === id)
      .forEach((department) => visit(department.id));
  };
  roots.forEach(visit);
  return result;
}

export function employeeRole(db: Db, employeeId: string): Role {
  return db.users.find((user) => user.employeeId === employeeId)?.role ?? 'employee';
}

/**
 * Единая граница видимости сотрудников.
 * admin/hr — все; manager — подразделения и команды своих проектов; employee — только себя.
 */
export function scopeEmployeeIds(db: Db, actor: User) {
  const all = new Set(db.employees.map((employee) => employee.id));
  if (actor.role === 'admin' || actor.role === 'hr') return all;

  const result = new Set<string>();
  if (!actor.employeeId) return result;
  result.add(actor.employeeId);

  if (actor.role === 'employee') {
    // Сотрудник читает только себя. Имя руководителя приходит в его карточке
    // отдельным полем managerName, без доступа к чужой карточке.
    return result;
  }

  const departments = managerScopeDepartmentIds(db, actor.employeeId);
  db.employees.forEach((employee) => {
    if (departments.has(employee.departmentId)) result.add(employee.id);
  });
  const managedProjects = new Set(
    db.projects.filter((project) => project.managerId === actor.employeeId).map((project) => project.id),
  );
  db.assignments.forEach((assignment) => {
    if (managedProjects.has(assignment.projectId)) result.add(assignment.employeeId);
  });
  return result;
}

export function dataScopeEmployeeIds(db: Db, actor: User) {
  if (actor.role === 'employee') {
    return new Set(actor.employeeId ? [actor.employeeId] : []);
  }
  return scopeEmployeeIds(db, actor);
}

export function canReadEmployee(db: Db, actor: User, employeeId: string) {
  return scopeEmployeeIds(db, actor).has(employeeId);
}

export function canReadProject(db: Db, actor: User, projectId: string) {
  if (actor.role === 'admin' || actor.role === 'hr' || actor.role === 'manager') return true;
  return db.assignments.some(
    (assignment) => assignment.projectId === projectId && assignment.employeeId === actor.employeeId,
  );
}

export function projectView(db: Db, project: Project): Project {
  const manager = project.managerId
    ? db.employees.find((employee) => employee.id === project.managerId)
    : null;
  return { ...project, managerName: manager ? fullName(manager) : null };
}

export function canReadAbsence(db: Db, actor: User, employeeId: string) {
  return scopeEmployeeIds(db, actor).has(employeeId);
}

export function canReadTimesheet(db: Db, actor: User, employeeId: string) {
  return scopeEmployeeIds(db, actor).has(employeeId);
}
