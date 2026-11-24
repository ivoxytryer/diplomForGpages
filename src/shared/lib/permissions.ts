import type { Role } from '@/shared/types';

export type Action =
  | 'employees:read'
  | 'employees:write'
  | 'employees:delete'
  | 'employees:dismiss'
  | 'salary:read'
  | 'salary:write'
  | 'directories:write'
  | 'timesheet:read'
  | 'timesheet:edit'
  | 'timesheet:approve'
  | 'absences:create'
  | 'absences:approve'
  | 'events:write'
  | 'projects:write'
  | 'projects:delete'
  | 'projects:manage-team'
  | 'projects:manage-manager'
  | 'tasks:read'
  | 'tasks:write'
  | 'reports:read'
  | 'users:manage'
  | 'audit:read';

const access: Record<Role, Action[]> = {
  admin: [
    'employees:read',
    'employees:write',
    'employees:delete',
    'employees:dismiss',
    'salary:read',
    'salary:write',
    'directories:write',
    'timesheet:read',
    'timesheet:edit',
    'timesheet:approve',
    'absences:create',
    'absences:approve',
    'events:write',
    'projects:write',
    'projects:delete',
    'projects:manage-team',
    'projects:manage-manager',
    'tasks:read',
    'tasks:write',
    'reports:read',
    'users:manage',
    'audit:read',
  ],
  hr: [
    'employees:read',
    'employees:write',
    'salary:read',
    'directories:write',
    'timesheet:read',
    'timesheet:edit',
    'timesheet:approve',
    'absences:create',
    'absences:approve',
    'events:write',
    'projects:write',
    'projects:delete',
    'projects:manage-team',
    'projects:manage-manager',
    'tasks:read',
    'reports:read',
  ],
  manager: [
    'employees:read',
    'salary:read',
    'timesheet:read',
    'timesheet:approve',
    'absences:create',
    'absences:approve',
    'projects:write',
    'projects:manage-team',
    'projects:manage-manager',
    'tasks:read',
    'tasks:write',
    'reports:read',
  ],
  employee: [
    'employees:read',
    'salary:read',
    'timesheet:read',
    'absences:create',
    'tasks:read',
  ],
};

export function can(role: Role | undefined | null, action: Action) {
  if (!role) return false;
  const allowed = access[role as Role];
  return allowed ? allowed.includes(action) : false;
}

/**
 * Оклад сотрудника: admin и HR видят все оклады, остальные роли — только свой.
 * Руководитель не должен видеть оклады сотрудников своего подразделения.
 */
export function canViewSalary(
  viewer: { role: Role; employeeId?: string | null } | null | undefined,
  targetEmployeeId: string,
) {
  if (!viewer) return false;
  if (viewer.role === 'admin' || viewer.role === 'hr') return true;
  return viewer.employeeId === targetEmployeeId;
}

/** Иерархия для согласования отсутствий: подтверждает только роль выше заявителя. */
const roleRank: Record<Role, number> = {
  employee: 1,
  manager: 2,
  hr: 3,
  admin: 4,
};

export function canApproveAbsence(actor: Role, requester: Role | undefined) {
  if (actor === 'admin') return true;
  if (!requester) return true;
  return roleRank[actor] > roleRank[requester];
}
