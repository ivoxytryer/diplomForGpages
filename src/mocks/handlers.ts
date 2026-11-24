import { http, HttpResponse } from 'msw';
import dayjs from 'dayjs';
import type {
  Absence,
  AbsencePayload,
  AbsenceTaskDecision,
  AbsenceTaskDecisionRecord,
  AbsenceTaskHandover,
  Assignment,
  AssignmentPayload,
  AuditEntry,
  ChangePasswordPayload,
  CreateUserPayload,
  CreateUserResponse,
  DashboardData,
  Db,
  Department,
  DepartmentPayload,
  Employee,
  EmployeePayload,
  HrEvent,
  HrEventPayload,
  Notification,
  Position,
  PositionPayload,
  Project,
  ProjectPayload,
  ProjectTask,
  ProjectTaskPayload,
  ProjectTaskUpdatePayload,
  Role,
  TaskHandoverCandidate,
  TimesheetCode,
  TimesheetStatus,
  User,
  VacationBalanceView,
} from '@/shared/types';
import {
  formatDate,
  fullName,
  monthKey,
  todayISO,
} from '@/shared/lib/utils';
import {
  absenceEventTitle,
  absenceEventType,
  absenceTypeMeta,
  roleLabels,
  timesheetCodes,
  timesheetStatusMeta,
} from '@/shared/lib/meta';
import { absenceDayBreakdown, findAbsenceOverlap } from '@/shared/lib/absences';
import { can, canApproveAbsence } from '@/shared/lib/permissions';
import { calculateLoad, ADMIN_LOAD_LIMIT } from '@/shared/lib/workload';
import { getCalendarDay, isWorkingDay } from '@/shared/lib/calendar';
import {
  ABSENCE_STATUSES,
  ABSENCE_TYPES,
  EMPLOYEE_STATUSES,
  HR_EVENT_TYPES,
  PROJECT_STATUSES,
  PROJECT_TASK_STATUSES,
  ROLES,
  TIMESHEET_STATUSES,
} from '@/shared/lib/enums';
import { postponeTaskDate, sortTasks } from '@/shared/lib/tasks';
import { buildTimesheet } from './timesheet';
import { loadDb, resetDb, saveDb } from './db';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password';

const BASE = '/api/v1';

function str(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value && value.length > 0 ? value : undefined;
}

function nextId(prefix: string, items: { id: string }[]) {
  const max = items.reduce((acc, item) => {
    const numeric = Number(item.id.replace(/\D/g, ''));
    return Number.isFinite(numeric) ? Math.max(acc, numeric) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/**
 * Граница API: из тела запроса берём только поля, которые разрешено менять.
 * Иначе клиент может подменить id, служебные поля или статус в обход сценария.
 */
function pickFields<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

const employeeFields = [
  'lastName',
  'firstName',
  'middleName',
  'birthDate',
  'gender',
  'email',
  'phone',
  'departmentId',
  'positionId',
  'managerId',
  'hireDate',
  'status',
  'employmentType',
  'salary',
  'education',
] as const satisfies readonly (keyof EmployeePayload)[];

const personalEmployeeFields = [
  'lastName',
  'firstName',
  'middleName',
  'birthDate',
  'gender',
  'email',
  'phone',
  'employmentType',
  'education',
] as const satisfies readonly (keyof EmployeePayload)[];

const departmentFields = [
  'name',
  'code',
  'parentId',
  'headId',
  'description',
] as const satisfies readonly (keyof DepartmentPayload)[];

const positionFields = [
  'name',
  'departmentId',
  'family',
  'grade',
  'salaryMin',
  'salaryMax',
] as const satisfies readonly (keyof PositionPayload)[];

const projectFields = [
  'code',
  'name',
  'description',
  'status',
  'startDate',
  'endDate',
  'managerId',
  'color',
] as const satisfies readonly (keyof ProjectPayload)[];

const assignmentFields = [
  'projectId',
  'employeeId',
  'projectRole',
  'allocation',
  'startDate',
  'endDate',
  'overloadReason',
] as const satisfies readonly (keyof AssignmentPayload)[];

const absenceFields = [
  'employeeId',
  'type',
  'startDate',
  'endDate',
  'reason',
] as const satisfies readonly (keyof AbsencePayload)[];

const absenceUpdateFields = [
  'type',
  'startDate',
  'endDate',
  'reason',
] as const satisfies readonly (keyof AbsencePayload)[];

function authUser(request: Request, db: Db): User | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer mock-')) return null;
  const userId = header.replace('Bearer mock-', '');
  return db.users.find((user) => user.id === userId && user.isActive) ?? null;
}

/**
 * Оклад видят admin и HR, остальные — только свой.
 * Для остальных поле вырезается из ответа, а не просто прячется в UI.
 */
function redactSalary(employee: Employee, viewer: User | null): Employee {
  if (!viewer) return employee;
  if (viewer.role === 'admin' || viewer.role === 'hr') return employee;
  if (viewer.employeeId === employee.id) return employee;
  const copy = { ...employee };
  delete (copy as Partial<Employee>).salary;
  return copy;
}

/** Проверяет, что должность существует и относится к выбранному подразделению. */
function checkPositionForDepartment(db: Db, departmentId: string, positionId: string) {
  const position = db.positions.find((item) => item.id === positionId);
  if (!position) return 'Должность не найдена';
  if (position.departmentId && position.departmentId !== departmentId) {
    return 'Должность относится к другому подразделению';
  }
  return null;
}

function pushAudit(
  db: Db,
  user: User | null,
  action: string,
  entity: string,
  entityId: string,
  details?: string,
) {
  const entry: AuditEntry = {
    id: nextId('au', db.audit),
    at: new Date().toISOString(),
    userId: user?.id ?? 'system',
    userName: user?.name ?? 'Система',
    action,
    entity,
    entityId,
    details,
  };
  db.audit.push(entry);
  db.audit.sort((a, b) => a.at.localeCompare(b.at));
  if (db.audit.length > 200) db.audit = db.audit.slice(-200);
}

function notFound(detail = 'Запись не найдена') {
  return HttpResponse.json({ detail }, { status: 404 });
}

function badRequest(detail: string) {
  return HttpResponse.json({ detail }, { status: 400 });
}

function unauthorized(detail = 'Требуется авторизация') {
  return HttpResponse.json({ detail }, { status: 401 });
}

function forbidden(detail = 'Недостаточно прав') {
  return HttpResponse.json({ detail }, { status: 403 });
}

function canManageAccounts(role: Role) {
  return role === 'admin' || role === 'hr';
}

function canManageTasks(user: User | null) {
  return user?.role === 'admin' || user?.role === 'manager';
}

/**
 * Подразделение менеджера + подразделения, где он руководитель, + все дочерние.
 * Так руководитель видит не только свою карточку отдела, но и подчинённую структуру.
 */
function managerScopeDepartmentIds(db: Db, managerEmployeeId: string) {
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

function employeeRole(db: Db, employeeId: string): Role {
  return db.users.find((user) => user.employeeId === employeeId)?.role ?? 'employee';
}

function canApproveAbsenceFor(db: Db, actor: User, absence: Absence) {
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

function canApproveTimesheetFor(db: Db, actor: User, employeeId: string) {
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

function assignmentLoadAt(
  db: Db,
  employeeId: string,
  date: string,
  excludeAssignmentId?: string,
) {
  return calculateLoad(db.assignments, db.projects, employeeId, date, excludeAssignmentId);
}

/**
 * Единая граница видимости сотрудников.
 * admin/hr — все; manager — подразделения и команды своих проектов; employee — только себя.
 */
function scopeEmployeeIds(db: Db, actor: User) {
  const all = new Set(db.employees.map((employee) => employee.id));
  if (actor.role === 'admin' || actor.role === 'hr') return all;

  const result = new Set<string>();
  if (!actor.employeeId) return result;
  result.add(actor.employeeId);

  if (actor.role === 'employee') {
    const own = db.employees.find((employee) => employee.id === actor.employeeId);
    if (own?.managerId) result.add(own.managerId);
    const head = db.departments.find((department) => department.id === own?.departmentId)?.headId;
    if (head) result.add(head);
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

function dataScopeEmployeeIds(db: Db, actor: User) {
  if (actor.role === 'employee') {
    return new Set(actor.employeeId ? [actor.employeeId] : []);
  }
  return scopeEmployeeIds(db, actor);
}

function canReadEmployee(db: Db, actor: User, employeeId: string) {
  return scopeEmployeeIds(db, actor).has(employeeId);
}

function canReadProject(db: Db, actor: User, projectId: string) {
  if (actor.role === 'admin' || actor.role === 'hr' || actor.role === 'manager') return true;
  return db.assignments.some(
    (assignment) => assignment.projectId === projectId && assignment.employeeId === actor.employeeId,
  );
}

function canReadAbsence(db: Db, actor: User, employeeId: string) {
  return scopeEmployeeIds(db, actor).has(employeeId);
}

function canReadTimesheet(db: Db, actor: User, employeeId: string) {
  return scopeEmployeeIds(db, actor).has(employeeId);
}

function pushNotification(
  db: Db,
  notification: Omit<Notification, 'id' | 'createdAt' | 'readAt'>,
) {
  db.notifications.push({
    ...notification,
    id: nextId('n', db.notifications),
    createdAt: new Date().toISOString(),
    readAt: null,
  });
}

function employeeUser(db: Db, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  return db.users.find((user) => user.employeeId === employeeId && user.isActive) ?? null;
}

function notifyEmployee(db: Db, employeeId: string | null | undefined, payload: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'readAt'>) {
  const user = employeeUser(db, employeeId);
  if (!user) return;
  pushNotification(db, { ...payload, userId: user.id });
}

function notifyHrAndAdmin(db: Db, payload: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'readAt'>, excludeUserId?: string) {
  db.users
    .filter(
      (user) =>
        user.isActive &&
        user.id !== excludeUserId &&
        (user.role === 'hr' || user.role === 'admin'),
    )
    .forEach((user) => pushNotification(db, { ...payload, userId: user.id }));
}

function vacationBalanceView(
  db: Db,
  employeeId: string,
  year: number,
  excludeAbsenceId?: string,
): VacationBalanceView {

  const balance =
    db.vacationBalances.find(
      (item) => item.employeeId === employeeId && item.year === year,
    ) ??
    ({
      id: `default-${employeeId}-${year}`,
      employeeId,
      year,
      entitlement: 28,
      carryover: 0,
      updatedAt: new Date().toISOString(),
    });

  const today = todayISO();
  const vacations = db.absences.filter(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.type === 'vacation' &&
      absence.id !== excludeAbsenceId &&
      absence.status !== 'rejected' &&
      absence.startDate.slice(0, 4) === String(year),
  );
  const used = vacations
    .filter((absence) => absence.status === 'approved' && absence.startDate <= today)
    .reduce((sum, absence) => sum + absence.days, 0);
  const planned = vacations
    .filter(
      (absence) =>
        absence.status === 'pending' ||
        (absence.status === 'approved' && absence.startDate > today),
    )
    .reduce((sum, absence) => sum + absence.days, 0);

  return {
    ...balance,
    used,
    planned,
    remaining: balance.entitlement + balance.carryover - used - planned,
  };
}

function vacationLimitError(
  db: Db,
  employeeId: string,
  type: Absence['type'],
  startDate: string,
  endDate: string,
  excludeAbsenceId?: string,
) {
  if (type !== 'vacation') return null;
  const year = Number(startDate.slice(0, 4));
  const days = absenceDayBreakdown(type, startDate, endDate).days;
  const balance = vacationBalanceView(db, employeeId, year, excludeAbsenceId);
  if (days > balance.remaining) {
    return `Недостаточно дней отпуска: остаток ${balance.remaining}, запрошено ${days}`;
  }
  return null;
}

function validateOverload(
  actor: User,
  projectedLoad: number,
  reason: string | undefined,
) {
  if (projectedLoad <= 100) return null;
  if (actor.role !== 'admin') {
    return 'Превышение загрузки: итоговая загрузка сотрудника не может быть больше 100%';
  }
  if (projectedLoad > ADMIN_LOAD_LIMIT) {
    return `Администратор может разрешить перегруз только до ${ADMIN_LOAD_LIMIT}%`;
  }
  if (!reason?.trim()) {
    return 'Укажите причину перегруза — это действие доступно только администратору';
  }
  return null;
}

function createsDepartmentCycle(departments: Department[], departmentId: string, parentId: string) {
  const seen = new Set<string>();
  let currentId: string | null | undefined = parentId;
  while (currentId) {
    if (currentId === departmentId) return true;
    if (seen.has(currentId)) return true;
    seen.add(currentId);
    const id: string = currentId;
    currentId = departments.find((department) => department.id === id)?.parentId;
  }
  return false;
}

function scoreEmployees(db: Db, params: URLSearchParams) {
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

function restoreEmployee(db: Db, employee: Employee, actor: User) {
  employee.dismissalDate = null;
  const linkedUser = db.users.find((item) => item.employeeId === employee.id);
  if (linkedUser && !linkedUser.isActive) {
    linkedUser.isActive = true;
    pushAudit(
      db,
      actor,
      'Разблокирован доступ при восстановлении',
      'user',
      linkedUser.id,
      linkedUser.email,
    );
  }
}

/** Проверяет, можно ли уволить сотрудника без «осиротевших» задач и проектов. */
function dismissalBlocker(db: Db, employeeId: string) {
  const activeTasks = db.projectTasks.filter(
    (task) => task.employeeId === employeeId && task.status !== 'done',
  );
  if (activeTasks.length) {
    return 'Сначала переназначьте активные задачи сотрудника';
  }
  const managedProjects = db.projects.filter((project) => project.managerId === employeeId);
  if (managedProjects.length) {
    return 'Сначала назначьте нового руководителя проектов';
  }
  return null;
}

function archiveEmployee(db: Db, employee: Employee, date: string, actor: User) {
  employee.status = 'dismissed';
  employee.dismissalDate = date;

  // Подчинённые и руководители подразделений не должны оставаться
  // за уволенным: поднимаем их на уровень выше.
  const fallbackManagerId =
    db.employees.find(
      (item) => item.id === employee.managerId && item.status !== 'dismissed',
    )?.id ?? null;
  db.employees.forEach((item) => {
    if (item.managerId === employee.id) item.managerId = fallbackManagerId;
  });
  db.departments = db.departments.map((department) =>
    department.headId === employee.id
      ? { ...department, headId: fallbackManagerId }
      : department,
  );

  // Незавершённые назначения больше не должны попадать в текущую загрузку.
  // Будущие назначения, которые ещё не начались, просто убираем.
  db.assignments = db.assignments.filter(
    (assignment) => !(assignment.employeeId === employee.id && assignment.startDate > date),
  );
  db.assignments.forEach((assignment) => {
    if (
      assignment.employeeId === employee.id &&
      (!assignment.endDate || assignment.endDate > date)
    ) {
      assignment.endDate = date;
    }
  });

  // Заявки, которые ещё не согласованы, после увольнения теряют смысл.
  db.absences.forEach((absence) => {
    if (absence.employeeId === employee.id && absence.status === 'pending') {
      absence.status = 'rejected';
      absence.approvedBy = null;
    }
  });

  const linkedUser = db.users.find(
    (item) => item.employeeId === employee.id && item.isActive,
  );
  if (linkedUser) {
    linkedUser.isActive = false;
    pushAudit(
      db,
      actor,
      'Заблокирован доступ при увольнении',
      'user',
      linkedUser.id,
      linkedUser.email,
    );
  }
}

/** Согласованное отсутствие важнее старых ручных правок табеля. */
function clearAbsenceOverrides(db: Db, absence: Absence) {
  for (const key of Object.keys(db.timesheetOverrides)) {
    if (!key.startsWith(`${absence.employeeId}|`)) continue;
    const list = db.timesheetOverrides[key] ?? [];
    const next = list.filter(
      (item) => item.date < absence.startDate || item.date > absence.endDate,
    );
    if (next.length === list.length) continue;
    if (next.length) db.timesheetOverrides[key] = next;
    else delete db.timesheetOverrides[key];
  }
}

function syncEmployeeStatus(db: Db, employeeId: string) {
  const employee = db.employees.find((item) => item.id === employeeId);
  if (!employee || employee.status === 'dismissed') return;
  const today = todayISO();
  const active = db.absences.find(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.status === 'approved' &&
      absence.startDate <= today &&
      absence.endDate >= today,
  );
  if (active) {
    if (active.type === 'sick') {
      employee.status = 'sick_leave';
    } else if (active.type !== 'business_trip') {
      // Командировка — рабочие дни, статус сотрудника при этом не меняется.
      employee.status = 'vacation';
    }
  } else if (employee.status === 'vacation' || employee.status === 'sick_leave') {
    employee.status = dayjs(employee.hireDate).add(3, 'month').isAfter(dayjs()) ? 'probation' : 'active';
  }
}

/**
 * Синхронизирует кадровое событие об отсутствии: создаёт его при согласовании,
 * обновляет при изменении дат/типа и удаляет, если заявка больше не согласована.
 * Благодаря этому отпуска, больничные и командировки попадают в ленту событий.
 */
function syncAbsenceEvent(db: Db, absence: Absence, author: User | null) {
  const existing = db.events.find((event) => event.absenceId === absence.id);

  if (absence.status !== 'approved') {
    if (existing) db.events = db.events.filter((event) => event.absenceId !== absence.id);
    return;
  }

  const type = absenceEventType[absence.type];
  const title = absenceEventTitle[absence.type];
  if (!type || !title) return;

  const details = {
    type,
    date: absence.startDate,
    title,
    description: `Период: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}${
      absence.reason ? ` · ${absence.reason}` : ''
    }`,
  };

  if (existing) {
    Object.assign(existing, details);
    return;
  }

  db.events.push({
    id: nextId('ev', db.events),
    employeeId: absence.employeeId,
    ...details,
    absenceId: absence.id,
    authorId: author?.employeeId ?? null,
  });
}

function birthdayInfo(birthDate: string) {
  const birth = dayjs(birthDate);
  const today = dayjs().startOf('day');
  let next = today.month(birth.month()).date(birth.date());
  if (next.isBefore(today)) next = next.add(1, 'year');
  return {
    date: next.format('YYYY-MM-DD'),
    daysLeft: next.diff(today, 'day'),
  };
}

export const handlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const db = loadDb();
    const user = db.users.find((item) => item.email.toLowerCase() === body.email?.toLowerCase());
    if (!user || !verifyPassword(body.password ?? '', db.passwordHashes[user.id])) {
      return HttpResponse.json({ detail: 'Неверный email или пароль' }, { status: 401 });
    }
    if (!user.isActive) {
      return HttpResponse.json({ detail: 'Пользователь заблокирован' }, { status: 403 });
    }
    user.lastLoginAt = new Date().toISOString();
    saveDb(db);
    return HttpResponse.json({ token: `mock-${user.id}`, user });
  }),

  http.get(`${BASE}/auth/me`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    return HttpResponse.json(user);
  }),

  http.post(`${BASE}/auth/change-password`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');

    const body = (await request.json()) as ChangePasswordPayload;
    if (!verifyPassword(body.currentPassword ?? '', db.passwordHashes[user.id])) {
      return badRequest('Текущий пароль указан неверно');
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return badRequest('Новый пароль должен содержать не менее 8 символов');
    }
    if (body.newPassword === body.currentPassword) {
      return badRequest('Новый пароль должен отличаться от текущего');
    }

    db.passwordHashes[user.id] = hashPassword(body.newPassword, user.id);
    user.mustChangePassword = false;
    pushAudit(db, user, 'Изменён пароль', 'auth', user.id, user.email);
    saveDb(db);
    return HttpResponse.json(user);
  }),

  http.get(`${BASE}/notifications`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const items = db.notifications
      .filter((notification) => notification.userId === user.id)
      .filter((notification) => !unreadOnly || !notification.readAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(items);
  }),

  http.patch(`${BASE}/notifications/read-all`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const at = new Date().toISOString();
    db.notifications.forEach((notification) => {
      if (notification.userId === user.id && !notification.readAt) {
        notification.readAt = at;
      }
    });
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

  http.patch(`${BASE}/notifications/:id/read`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const notification = db.notifications.find(
      (item) => item.id === params.id && item.userId === user.id,
    );
    if (!notification) return notFound('Уведомление не найдено');
    notification.readAt = new Date().toISOString();
    saveDb(db);
    return HttpResponse.json(notification);
  }),

  http.get(`${BASE}/dashboard`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'employee') return forbidden('Дашборд недоступен сотруднику');
    const url = new URL(request.url);
    const departmentId = str(url, 'departmentId');
    const today = todayISO();
    const currentMonth = monthKey();
    const managerDepartments =
      user.role === 'manager' && user.employeeId
        ? managerScopeDepartmentIds(db, user.employeeId)
        : null;
    if (departmentId && managerDepartments && !managerDepartments.has(departmentId)) {
      return forbidden('Нет доступа к этому подразделению');
    }
    const employees = db.employees.filter(
      (employee) =>
        employee.status !== 'dismissed' &&
        (!departmentId || employee.departmentId === departmentId) &&
        (!managerDepartments || managerDepartments.has(employee.departmentId)),
    );
    const ids = new Set(employees.map((employee) => employee.id));
    const eventEmployeeIds = new Set(employees.map((employee) => employee.id));
    const activeProjects = db.projects.filter((project) => project.status === 'active');
    const totalAllocation = employees.reduce(
      (sum, employee) =>
        sum + calculateLoad(db.assignments, db.projects, employee.id, today),
      0,
    );
    const avgUtilization = employees.length ? Math.round(totalAllocation / employees.length) : 0;

    const byDepartmentMap = new Map<string, number>();
    employees.forEach((employee) => {
      const department = db.departments.find((item) => item.id === employee.departmentId);
      const name = department?.name ?? 'Без подразделения';
      byDepartmentMap.set(name, (byDepartmentMap.get(name) ?? 0) + 1);
    });

    const dynamics = Array.from({ length: 6 }, (_, index) => {
      const month = dayjs().subtract(5 - index, 'month').format('YYYY-MM');
      const hired = db.employees.filter(
        (employee) =>
          employee.hireDate.startsWith(month) && (!departmentId || employee.departmentId === departmentId),
      ).length;
      const dismissed = db.employees.filter(
        (employee) =>
          employee.status === 'dismissed' &&
          employee.dismissalDate?.startsWith(month) &&
          (!departmentId || employee.departmentId === departmentId),
      ).length;
      return { month, hired, dismissed };
    });

    const teamByProject = activeProjects.map((project) => ({
      name: project.name,
      count: new Set(
        db.assignments
          .filter(
            (assignment) =>
              assignment.projectId === project.id &&
              ids.has(assignment.employeeId) &&
              assignment.startDate <= today &&
              (!assignment.endDate || assignment.endDate >= today),
          )
          .map((assignment) => assignment.employeeId),
      ).size,
    }));

    const birthdays = employees
      .map((employee) => ({ employeeId: employee.id, ...birthdayInfo(employee.birthDate) }))
      .filter((item) => item.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const absentToday = db.absences.filter(
      (absence) =>
        ids.has(absence.employeeId) &&
        absence.status === 'approved' &&
        absence.startDate <= today &&
        absence.endDate >= today,
    ).length;

    const pendingAbsences = db.absences.filter(
      (absence) => ids.has(absence.employeeId) && absence.status === 'pending',
    ).length;

    const recentEvents = db.events
      .filter((event) => eventEmployeeIds.has(event.employeeId))
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
      .slice(0, 8);

    const data: DashboardData = {
      headcount: employees.length,
      probation: employees.filter((employee) => employee.status === 'probation').length,
      hiredThisMonth: db.employees.filter(
        (employee) =>
          employee.hireDate.startsWith(currentMonth) &&
          (!departmentId || employee.departmentId === departmentId),
      ).length,
      dismissedThisMonth: db.employees.filter(
        (employee) =>
          employee.status === 'dismissed' &&
          employee.dismissalDate?.startsWith(currentMonth) &&
          (!departmentId || employee.departmentId === departmentId),
      ).length,
      activeProjects: activeProjects.length,
      avgUtilization,
      absentToday,
      pendingAbsences,
      byDepartment: [...byDepartmentMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      dynamics,
      teamByProject: teamByProject.sort((a, b) => b.count - a.count).slice(0, 6),
      birthdays,
      recentEvents,
    };
    return HttpResponse.json(data);
  }),

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
    return HttpResponse.json(redactSalary(employee, viewer));
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

  http.get(`${BASE}/positions`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'admin' || user.role === 'hr') {
      return HttpResponse.json(db.positions);
    }
    return HttpResponse.json(
      db.positions.map(({ salaryMin: _salaryMin, salaryMax: _salaryMax, ...position }) => position),
    );
  }),

  http.post(`${BASE}/positions`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as PositionPayload;
    if (body.salaryMin > body.salaryMax) {
      return badRequest('Минимальный оклад не может быть больше максимального');
    }
    if (!body.name?.trim() || !body.family?.trim()) {
      return badRequest('Укажите название и профессиональную ветку');
    }
    if (!db.departments.some((item) => item.id === body.departmentId)) {
      return badRequest('Подразделение не найдено');
    }
    if (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 4) {
      return badRequest('Грейд должен быть от 1 до 4');
    }
    const position: Position = {
      ...pickFields(body, positionFields),
      id: nextId('p', db.positions),
    };
    db.positions.push(position);
    pushAudit(db, user, 'Создана должность', 'position', position.id, position.name);
    saveDb(db);
    return HttpResponse.json(position, { status: 201 });
  }),

  http.patch(`${BASE}/positions/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<PositionPayload>;
    const position = db.positions.find((item) => item.id === params.id);
    if (!position) return notFound();
    if (
      user.role !== 'admin' &&
      (body.salaryMin !== undefined || body.salaryMax !== undefined)
    ) {
      return forbidden('Вилку оклада изменяет администратор');
    }
    const nextDepartmentId = body.departmentId ?? position.departmentId;
    if (
      nextDepartmentId !== position.departmentId &&
      db.employees.some((employee) => employee.positionId === position.id)
    ) {
      return badRequest('Должность занята сотрудниками — сначала оформите перевод');
    }
    const salaryMin = body.salaryMin ?? position.salaryMin;
    const salaryMax = body.salaryMax ?? position.salaryMax;
    if (salaryMin > salaryMax) {
      return badRequest('Минимальный оклад не может быть больше максимального');
    }
    const departmentId = body.departmentId ?? position.departmentId;
    if (!db.departments.some((item) => item.id === departmentId)) {
      return badRequest('Подразделение не найдено');
    }
    const grade = body.grade ?? position.grade;
    if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
      return badRequest('Грейд должен быть от 1 до 4');
    }
    if (body.family !== undefined && !body.family.trim()) {
      return badRequest('Укажите профессиональную ветку');
    }
    Object.assign(position, pickFields(body, positionFields));
    pushAudit(db, user, 'Изменена должность', 'position', position.id, position.name);
    saveDb(db);
    return HttpResponse.json(position);
  }),

  http.delete(`${BASE}/positions/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'directories:write')) return forbidden('Недостаточно прав');
    const position = db.positions.find((item) => item.id === params.id);
    if (!position) return notFound();
    if (db.employees.some((employee) => employee.positionId === position.id)) {
      return badRequest('Должность занята сотрудниками');
    }
    db.positions = db.positions.filter((item) => item.id !== position.id);
    pushAudit(db, user, 'Удалена должность', 'position', position.id, position.name);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${BASE}/projects`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'employee') {
      const allowedProjectIds = new Set(
        db.assignments
          .filter((assignment) => assignment.employeeId === user.employeeId)
          .map((assignment) => assignment.projectId),
      );
      return HttpResponse.json(
        db.projects.filter((project) => allowedProjectIds.has(project.id)),
      );
    }
    return HttpResponse.json(db.projects);
  }),

  http.get(`${BASE}/projects/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const project = db.projects.find((item) => item.id === params.id);
    if (!project) return notFound('Проект не найден');
    if (!canReadProject(db, user, project.id)) {
      return forbidden('Нет доступа к проекту');
    }
    return HttpResponse.json(project);
  }),

  http.post(`${BASE}/projects`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as ProjectPayload;
    if (!PROJECT_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус проекта');
    }
    if (body.endDate && body.endDate < body.startDate) {
      return badRequest('Дата окончания проекта раньше даты начала');
    }
    if (user.role === 'manager') {
      if (!user.employeeId) {
        return forbidden('У руководителя нет привязанной карточки сотрудника');
      }
      if (body.managerId && body.managerId !== user.employeeId) {
        return forbidden('Руководитель может назначить руководителем только себя');
      }
    }
    const managerId =
      user.role === 'manager' ? user.employeeId : (body.managerId ?? null);
    if (managerId) {
      const manager = db.employees.find((item) => item.id === managerId);
      if (!manager) return badRequest('Руководитель проекта не найден');
      if (manager.status === 'dismissed') {
        return badRequest('Нельзя назначить уволенного сотрудника руководителем');
      }
    }
    const project: Project = {
      ...pickFields(body, projectFields),
      managerId,
      id: nextId('pr', db.projects),
    };
    db.projects.push(project);
    pushAudit(db, user, 'Создан проект', 'project', project.id, project.name);
    saveDb(db);
    return HttpResponse.json(project, { status: 201 });
  }),

  http.patch(`${BASE}/projects/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<ProjectPayload>;
    const project = db.projects.find((item) => item.id === params.id);
    if (!project) return notFound();
    if (user.role === 'manager') {
      if (project.managerId !== user.employeeId) {
        return forbidden('Можно редактировать только свои проекты');
      }
      if (body.managerId === null) {
        return badRequest('Выберите нового руководителя проекта');
      }
    }
    if (
      body.managerId !== undefined &&
      body.managerId !== project.managerId &&
      !can(user.role, 'projects:manage-manager')
    ) {
      return forbidden(
        'Менять руководителя проекта может администратор, HR или руководитель проекта',
      );
    }
    if (
      body.status !== undefined &&
      !PROJECT_STATUSES.includes(body.status)
    ) {
      return badRequest('Некорректный статус проекта');
    }
    const startDate = body.startDate ?? project.startDate;
    const endDate = body.endDate === undefined ? project.endDate : body.endDate;
    if (endDate && endDate < startDate) {
      return badRequest('Дата окончания проекта раньше даты начала');
    }
    let nextManagerName: string | null = null;
    if (body.managerId !== undefined && body.managerId !== null) {
      const manager = db.employees.find((item) => item.id === body.managerId);
      if (!manager) return badRequest('Руководитель проекта не найден');
      if (manager.status === 'dismissed') {
        return badRequest('Нельзя назначить уволенного сотрудника руководителем');
      }
      nextManagerName = fullName(manager);
    }
    const managerChanged =
      body.managerId !== undefined && body.managerId !== project.managerId;
    Object.assign(project, pickFields(body, projectFields));
    if (managerChanged && project.managerId) {
      notifyEmployee(db, project.managerId, {
        type: 'project_transfer',
        title: 'Вы назначены руководителем проекта',
        body: `${project.code} · ${project.name}`,
        link: `/projects/${project.id}`,
      });
    }
    pushAudit(
      db,
      user,
      'Изменён проект',
      'project',
      project.id,
      managerChanged && nextManagerName
        ? `${project.name} · новый руководитель: ${nextManagerName}`
        : project.name,
    );
    saveDb(db);
    return HttpResponse.json(project);
  }),

  http.delete(`${BASE}/projects/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:delete')) return forbidden('Удалять проекты могут администратор и HR');
    const project = db.projects.find((item) => item.id === params.id);
    if (!project) return notFound();
    db.projects = db.projects.filter((item) => item.id !== project.id);
    db.assignments = db.assignments.filter((item) => item.projectId !== project.id);
    db.projectTasks = db.projectTasks.filter((item) => item.projectId !== project.id);
    pushAudit(db, user, 'Удалён проект', 'project', project.id, project.name);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${BASE}/assignments`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const projectId = str(url, 'projectId');
    const allowed = dataScopeEmployeeIds(db, user);
    let items = db.assignments.filter((item) => allowed.has(item.employeeId));
    if (employeeId) items = items.filter((item) => item.employeeId === employeeId);
    if (projectId) items = items.filter((item) => item.projectId === projectId);
    return HttpResponse.json(items);
  }),

  http.post(`${BASE}/assignments`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:manage-team')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as AssignmentPayload;
    const project = db.projects.find((item) => item.id === body.projectId);
    if (!project) return notFound('Проект не найден');
    if (project.status === 'completed') {
      return badRequest('Нельзя назначить сотрудника на завершённый проект');
    }
    if (user.role === 'manager' && project.managerId !== user.employeeId) {
      return forbidden('Можно управлять командой только своих проектов');
    }
    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (employee.status === 'dismissed') {
      return badRequest('Нельзя назначить на проект уволенного сотрудника');
    }
    if (!Number.isFinite(body.allocation) || body.allocation < 0 || body.allocation > 100) {
      return badRequest('Загрузка должна быть от 0 до 100%');
    }
    if (body.endDate && body.endDate < body.startDate) {
      return badRequest('Дата окончания назначения раньше даты начала');
    }
    if (
      db.assignments.some(
        (item) => item.projectId === body.projectId && item.employeeId === body.employeeId,
      )
    ) {
      return badRequest('Сотрудник уже назначен на этот проект');
    }
    const currentLoad = assignmentLoadAt(db, body.employeeId, body.startDate);
    const projectedLoad = currentLoad + body.allocation;
    const overloadProblem = validateOverload(user, projectedLoad, body.overloadReason);
    if (overloadProblem) return badRequest(overloadProblem);

    const assignment: Assignment = {
      ...pickFields(body, assignmentFields),
      overloadReason:
        projectedLoad > 100 ? body.overloadReason?.trim() : undefined,
      id: nextId('a', db.assignments),
    };
    db.assignments.push(assignment);
    pushAudit(
      db,
      user,
      'Создано назначение на проект',
      'assignment',
      assignment.id,
      `${fullName(employee)} · ${project.name} · ${assignment.allocation}%${
        assignment.overloadReason ? ` · перегруз: ${assignment.overloadReason}` : ''
      }`,
    );
    saveDb(db);
    return HttpResponse.json(assignment, { status: 201 });
  }),

  http.patch(`${BASE}/assignments/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:manage-team')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<AssignmentPayload>;
    const assignment = db.assignments.find((item) => item.id === params.id);
    if (!assignment) return notFound();
    const targetProjectId = body.projectId ?? assignment.projectId;
    if (user.role === 'manager') {
      const currentProject = db.projects.find((item) => item.id === assignment.projectId);
      const targetProject = db.projects.find((item) => item.id === targetProjectId);
      if (
        currentProject?.managerId !== user.employeeId ||
        targetProject?.managerId !== user.employeeId
      ) {
        return forbidden('Можно управлять командой только своих проектов');
      }
    }
    if (body.allocation !== undefined) {
      if (!Number.isFinite(body.allocation) || body.allocation < 0 || body.allocation > 100) {
        return badRequest('Загрузка должна быть от 0 до 100%');
      }
    }
    const projectId = body.projectId ?? assignment.projectId;
    const employeeId = body.employeeId ?? assignment.employeeId;
    const startDate = body.startDate ?? assignment.startDate;
    const endDate = body.endDate === undefined ? assignment.endDate : body.endDate;
    if (endDate && endDate < startDate) {
      return badRequest('Дата окончания назначения раньше даты начала');
    }
    const targetProject = db.projects.find((item) => item.id === projectId);
    if (!targetProject) return notFound('Проект не найден');
    if (targetProject.status === 'completed') {
      return badRequest('Нельзя назначить сотрудника на завершённый проект');
    }
    const targetEmployee = db.employees.find((item) => item.id === employeeId);
    if (!targetEmployee) return notFound('Сотрудник не найден');
    if (targetEmployee.status === 'dismissed') {
      return badRequest('Нельзя назначить на проект уволенного сотрудника');
    }
    if (
      db.assignments.some(
        (item) =>
          item.id !== assignment.id &&
          item.projectId === projectId &&
          item.employeeId === employeeId,
      )
    ) {
      return badRequest('Сотрудник уже назначен на этот проект');
    }
    const allocation = body.allocation ?? assignment.allocation;
    const currentLoad = assignmentLoadAt(db, employeeId, startDate, assignment.id);
    const projectedLoad = currentLoad + allocation;
    const overloadProblem = validateOverload(user, projectedLoad, body.overloadReason ?? assignment.overloadReason);
    if (overloadProblem) return badRequest(overloadProblem);
    Object.assign(assignment, pickFields(body, assignmentFields));
    assignment.overloadReason =
      projectedLoad > 100
        ? (body.overloadReason ?? assignment.overloadReason)?.trim()
        : undefined;
    const employee = db.employees.find((item) => item.id === assignment.employeeId);
    const project = db.projects.find((item) => item.id === assignment.projectId);
    pushAudit(
      db,
      user,
      'Изменено назначение на проект',
      'assignment',
      assignment.id,
      `${fullName(employee)} · ${project?.name ?? assignment.projectId} · ${assignment.allocation}%${
        assignment.overloadReason ? ` · перегруз: ${assignment.overloadReason}` : ''
      }`,
    );
    saveDb(db);
    return HttpResponse.json(assignment);
  }),

  http.delete(`${BASE}/assignments/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:manage-team')) return forbidden('Недостаточно прав');
    const assignment = db.assignments.find((item) => item.id === params.id);
    if (!assignment) return notFound();
    const project = db.projects.find((item) => item.id === assignment.projectId);
    if (user.role === 'manager' && project?.managerId !== user.employeeId) {
      return forbidden('Можно управлять командой только своих проектов');
    }
    const activeTasks = db.projectTasks.filter(
      (task) =>
        task.projectId === assignment.projectId &&
        task.employeeId === assignment.employeeId &&
        task.status === 'todo',
    );
    if (activeTasks.length) {
      return badRequest('Сначала переназначьте или закройте активные задачи сотрудника в проекте');
    }
    db.assignments = db.assignments.filter((item) => item.id !== assignment.id);
    const employee = db.employees.find((item) => item.id === assignment.employeeId);
    pushAudit(
      db,
      user,
      'Удалено назначение на проект',
      'assignment',
      assignment.id,
      `${fullName(employee)} · ${project?.name ?? assignment.projectId}`,
    );
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

  http.get(`${BASE}/tasks`, ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');

    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const projectId = str(url, 'projectId');
    const status = str(url, 'status');
    const mine = url.searchParams.get('mine') === 'true';

    let items = [...db.projectTasks];

    if (actor.role === 'employee') {
      items = actor.employeeId
        ? items.filter((item) => item.employeeId === actor.employeeId)
        : [];
    } else if (actor.role === 'manager') {
      const managedProjects = new Set(
        db.projects
          .filter((project) => project.managerId === actor.employeeId)
          .map((project) => project.id),
      );
      items = items.filter((item) => managedProjects.has(item.projectId));
      if (mine && actor.employeeId) {
        items = items.filter((item) => item.employeeId === actor.employeeId);
      } else if (employeeId) {
        items = items.filter((item) => item.employeeId === employeeId);
      }
    } else if (mine && actor.employeeId) {
      items = items.filter((item) => item.employeeId === actor.employeeId);
    } else if (employeeId) {
      items = items.filter((item) => item.employeeId === employeeId);
    }

    if (projectId) items = items.filter((item) => item.projectId === projectId);
    if (status) items = items.filter((item) => item.status === status);

    return HttpResponse.json(sortTasks(items));
  }),

  http.post(`${BASE}/tasks`, async ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');
    if (!canManageTasks(actor)) {
      return forbidden('Создавать задачи могут администраторы и руководители');
    }

    const body = (await request.json()) as ProjectTaskPayload;
    const title = body.title?.trim();
    if (!body.projectId || !body.employeeId || !title || !body.dueDate) {
      return badRequest('Заполните проект, сотрудника, название и плановую дату');
    }
    if (!dayjs(body.dueDate).isValid()) {
      return badRequest('Некорректная плановая дата');
    }

    const project = db.projects.find((item) => item.id === body.projectId);
    if (!project) return notFound('Проект не найден');
    if (actor.role === 'manager' && project.managerId !== actor.employeeId) {
      return forbidden('Ставить задачи можно только по своим проектам');
    }
    if (project.status === 'completed') {
      return badRequest('Нельзя создавать задачи по завершённому проекту');
    }

    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (employee.status === 'dismissed') {
      return badRequest('Нельзя назначить задачу уволенному сотруднику');
    }

    const assigned = db.assignments.some(
      (item) => item.projectId === body.projectId && item.employeeId === body.employeeId,
    );
    if (!assigned) {
      return badRequest('Сотрудник не назначен на этот проект');
    }

    const task: ProjectTask = {
      id: nextId('t', db.projectTasks),
      projectId: body.projectId,
      employeeId: body.employeeId,
      title,
      description: body.description?.trim() || undefined,
      dueDate: body.dueDate,
      estimateHours:
        body.estimateHours === undefined || body.estimateHours === null
          ? null
          : Number(body.estimateHours),
      status: 'todo',
      createdById: actor.id,
      createdByName: actor.name,
      createdAt: new Date().toISOString(),
      completedAt: null,
      originalDueDate: body.dueDate,
      carryCount: 0,
      carryHistory: [],
      completionHistory: [],
    };

    db.projectTasks.push(task);
    notifyEmployee(db, employee.id, {
      type: 'task_assigned',
      title: 'Новая задача',
      body: `${task.title} · срок ${formatDate(task.dueDate)}`,
      link: '/tasks',
    });
    pushAudit(
      db,
      actor,
      'Создана задача',
      'task',
      task.id,
      `${task.title} · ${fullName(employee)} · ${project.code}`,
    );
    saveDb(db);
    return HttpResponse.json(task, { status: 201 });
  }),

  http.patch(`${BASE}/tasks/:id`, async ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');

    const task = db.projectTasks.find((item) => item.id === params.id);
    if (!task) return notFound('Задача не найдена');
    const taskProject = db.projects.find((item) => item.id === task.projectId);
    if (actor.role === 'manager' && taskProject?.managerId !== actor.employeeId) {
      return forbidden('Можно изменять задачи только своих проектов');
    }

    const body = (await request.json()) as ProjectTaskUpdatePayload;
    if (body.status !== undefined && !PROJECT_TASK_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус задачи');
    }
    const manager = canManageTasks(actor);
    const own = Boolean(actor.employeeId && task.employeeId === actor.employeeId);

    if (!manager) {
      if (actor.role !== 'employee' || !own) {
        return forbidden('Можно изменять только свои задачи');
      }
      const allowed = Object.keys(body).every(
        (key) => key === 'status' || key === 'postpone' || key === 'completionComment',
      );
      if (!allowed) {
        return forbidden('Сотрудник может только выполнить или перенести задачу');
      }
    }

    let auditAction = 'Изменена задача';
    let auditDetails = task.title;

    if (body.employeeId !== undefined && body.employeeId !== task.employeeId) {
      if (!manager) {
        return forbidden('Переназначать задачу может руководитель или администратор');
      }
      const target = db.employees.find((item) => item.id === body.employeeId);
      if (!target) return notFound('Сотрудник не найден');
      if (target.status === 'dismissed') {
        return badRequest('Нельзя назначить задачу уволенному сотруднику');
      }
      const today = todayISO();
      const assigned = db.assignments.some(
        (assignment) =>
          assignment.projectId === task.projectId &&
          assignment.employeeId === target.id &&
          (!assignment.endDate || assignment.endDate >= today),
      );
      if (!assigned) {
        return badRequest('Сотрудник не назначен на проект');
      }
      task.employeeId = target.id;
      notifyEmployee(db, target.id, {
        type: 'task_assigned',
        title: 'Вам назначена задача',
        body: `${task.title} · срок ${formatDate(task.dueDate)}`,
        link: '/tasks',
      });
      auditAction = 'Задача переназначена';
      auditDetails = `${task.title} · ${fullName(target)}`;
    }

    if (body.postpone) {
      if (task.status !== 'todo') {
        return badRequest('Нельзя перенести выполненную задачу');
      }
      const from = task.dueDate;
      const to = postponeTaskDate(task.dueDate);
      task.dueDate = to;
      task.carryCount += 1;
      task.carryHistory.push({ from, to, at: new Date().toISOString() });
      auditAction = 'Задача перенесена';
      auditDetails = `${task.title} · ${from} → ${to}`;
    }

    if (body.status && body.status !== task.status) {
      task.status = body.status;
      task.completionHistory = task.completionHistory ?? [];
      const comment = body.completionComment?.trim() ?? '';
      const at = new Date().toISOString();
      if (body.status === 'done') {
        task.completedAt = at;
        task.completionComment = comment || undefined;
        task.completedById = actor.employeeId ?? actor.id;
        task.completedByName = actor.name;
      } else {
        task.completedAt = null;
        task.completionComment = undefined;
        task.completedById = null;
        task.completedByName = null;
      }
      task.completionHistory.push({
        action: body.status === 'done' ? 'done' : 'reopen',
        comment,
        at,
        byId: actor.id,
        byName: actor.name,
      });
      auditAction =
        body.status === 'done' ? 'Задача выполнена' : 'Задача возвращена в работу';
    } else if (body.status === 'done' && body.completionComment !== undefined) {
      task.completionHistory = task.completionHistory ?? [];
      const comment = body.completionComment.trim();
      task.completionComment = comment || undefined;
      task.completedById = actor.employeeId ?? actor.id;
      task.completedByName = actor.name;
      task.completionHistory.push({
        action: 'done',
        comment,
        at: new Date().toISOString(),
        byId: actor.id,
        byName: actor.name,
      });
    }

    if (manager) {
      if (body.title !== undefined) {
        const title = body.title.trim();
        if (!title) return badRequest('Название задачи не может быть пустым');
        task.title = title;
      }
      if (body.description !== undefined) {
        task.description = body.description.trim() || undefined;
      }
      if (!body.postpone && body.dueDate !== undefined) {
        if (!dayjs(body.dueDate).isValid()) {
          return badRequest('Некорректная плановая дата');
        }
        task.dueDate = body.dueDate;
      }
      if (body.estimateHours !== undefined) {
        task.estimateHours =
          body.estimateHours === null ? null : Number(body.estimateHours);
      }
    }

    const employee = db.employees.find((item) => item.id === task.employeeId);
    if (body.status === 'done' && taskProject?.managerId) {
      notifyEmployee(db, taskProject.managerId, {
        type: 'task_completed',
        title: 'Задача выполнена',
        body: `${fullName(employee)} · ${task.title}`,
        link: `/projects/${task.projectId}`,
      });
    }
    pushAudit(
      db,
      actor,
      auditAction,
      'task',
      task.id,
      auditAction === 'Задача перенесена'
        ? auditDetails
        : `${task.title} · ${fullName(employee)}${
            task.completionComment ? ` · результат: ${task.completionComment}` : ''
          }`,
    );
    saveDb(db);
    return HttpResponse.json(task);
  }),

  http.delete(`${BASE}/tasks/:id`, ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');
    if (!canManageTasks(actor)) {
      return forbidden('Удалять задачи могут администраторы и руководители');
    }

    const task = db.projectTasks.find((item) => item.id === params.id);
    if (!task) return notFound('Задача не найдена');
    const taskProject = db.projects.find((item) => item.id === task.projectId);
    if (actor.role === 'manager' && taskProject?.managerId !== actor.employeeId) {
      return forbidden('Можно удалять задачи только своих проектов');
    }
    db.projectTasks = db.projectTasks.filter((item) => item.id !== task.id);
    pushAudit(db, actor, 'Удалена задача', 'task', task.id, task.title);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

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

  http.get(`${BASE}/absences`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const status = str(url, 'status');
    const month = str(url, 'month');
    const allowed = dataScopeEmployeeIds(db, user);
    let items = db.absences.filter((item) => allowed.has(item.employeeId));
    if (employeeId) {
      if (!canReadAbsence(db, user, employeeId)) {
        return forbidden('Нет доступа к отсутствиям сотрудника');
      }
      items = items.filter((item) => item.employeeId === employeeId);
    }
    if (status) items = items.filter((item) => item.status === status);
    if (month) {
      items = items.filter(
        (item) => item.startDate <= `${month}-31` && item.endDate >= `${month}-01`,
      );
    }
    items.sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')));
    return HttpResponse.json(items);
  }),

  http.get(`${BASE}/absences/:id/task-handover`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound('Заявка не найдена');
    if (!canApproveAbsenceFor(db, user, absence)) {
      return forbidden('Нельзя просматривать задачи этой заявки');
    }

    const tasks = db.projectTasks.filter(
      (task) => task.employeeId === absence.employeeId && task.status === 'todo',
    );

    const data: AbsenceTaskHandover = {
      absenceId: absence.id,
      tasks: tasks.map((task) => {
        const projectAssignments = db.assignments.filter(
          (assignment) =>
            assignment.projectId === task.projectId &&
            assignment.employeeId !== absence.employeeId &&
            assignment.startDate <= absence.endDate &&
            (!assignment.endDate || assignment.endDate >= absence.startDate),
        );
        const candidates: TaskHandoverCandidate[] = [];
        const seen = new Set<string>();

        for (const assignment of projectAssignments) {
          if (seen.has(assignment.employeeId)) continue;
          seen.add(assignment.employeeId);
          const employee = db.employees.find((item) => item.id === assignment.employeeId);
          if (!employee || employee.status === 'dismissed') continue;
          const targetAbsence = findAbsenceOverlap(db.absences, {
            employeeId: employee.id,
            startDate: absence.startDate,
            endDate: absence.endDate,
            statuses: ['approved'],
          });
          if (targetAbsence) continue;
          const load = assignmentLoadAt(db, employee.id, absence.startDate);
          if (load >= 100) continue;
          candidates.push({
            employeeId: employee.id,
            employeeName: fullName(employee),
            projectRole: assignment.projectRole,
            load,
          });
        }

        candidates.sort((a, b) => a.load - b.load || a.employeeName.localeCompare(b.employeeName, 'ru'));
        return { task, candidates };
      }),
    };

    return HttpResponse.json(data);
  }),

  http.post(`${BASE}/absences`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'absences:create')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as AbsencePayload;
    if (user.role !== 'admin' && (!user.employeeId || body.employeeId !== user.employeeId)) {
      return forbidden('Можно создать заявку только на себя');
    }
    if (!ABSENCE_TYPES.includes(body.type)) {
      return badRequest('Некорректный тип отсутствия');
    }
    if (!dayjs(body.startDate).isValid() || !dayjs(body.endDate).isValid()) {
      return badRequest('Укажите корректные даты отсутствия');
    }
    if (body.endDate < body.startDate) return badRequest('Дата окончания раньше даты начала');
    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (employee.status === 'dismissed') {
      return badRequest('Нельзя создать отсутствие уволенному сотруднику');
    }
    const overlap = findAbsenceOverlap(db.absences, {
      employeeId: body.employeeId,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    if (overlap) {
      return badRequest(
        `Период пересекается с существующей заявкой ${overlap.startDate} — ${overlap.endDate}`,
      );
    }
    const breakdown = absenceDayBreakdown(body.type, body.startDate, body.endDate);
    const vacationProblem = vacationLimitError(
      db,
      body.employeeId,
      body.type,
      body.startDate,
      body.endDate,
    );
    if (vacationProblem) return badRequest(vacationProblem);
    const absence: Absence = {
      ...pickFields(body, absenceFields),
      id: nextId('ab', db.absences),
      ...breakdown,
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedBy: null,
    };
    db.absences.push(absence);
    const requestTitle = `${absenceTypeMeta[absence.type].label}: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}`;
    notifyHrAndAdmin(
      db,
      {
        type: 'absence_request',
        title: 'Новая заявка на согласование',
        body: `${fullName(employee)} · ${requestTitle}`,
        link: '/absences?status=pending&scope=all',
      },
      user.id,
    );
    if (employee.managerId) {
      notifyEmployee(db, employee.managerId, {
        type: 'absence_request',
        title: 'Заявка сотрудника на согласование',
        body: `${fullName(employee)} · ${requestTitle}`,
        link: '/absences?status=pending&scope=all',
      });
    }
    pushAudit(db, user, 'Создана заявка на отсутствие', 'absence', absence.id, absenceTypeMeta[absence.type].label);
    saveDb(db);
    return HttpResponse.json(absence, { status: 201 });
  }),

  http.patch(`${BASE}/absences/:id/status`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'absences:approve')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as {
      status: Absence['status'];
      taskDecisions?: AbsenceTaskDecision[];
    };
    if (!ABSENCE_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус заявки');
    }
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound('Заявка не найдена');
    if (!canApproveAbsenceFor(db, user, absence)) {
      return forbidden('Нельзя согласовывать заявку вне своей зоны ответственности');
    }
    if (absence.type === 'sick' && body.status !== 'approved') {
      return badRequest('Больничный можно только подтвердить');
    }
    if (body.status === 'approved') {
      if (user.employeeId === absence.employeeId && user.role !== 'admin') {
        return forbidden('Собственную заявку может согласовать только администратор');
      }
      const overlap = findAbsenceOverlap(db.absences, {
        employeeId: absence.employeeId,
        startDate: absence.startDate,
        endDate: absence.endDate,
        excludeId: absence.id,
        statuses: ['approved'],
      });
      if (overlap) {
        return badRequest(
          `Период пересекается с согласованным отсутствием ${overlap.startDate} — ${overlap.endDate}`,
        );
      }

      const activeTasks = db.projectTasks.filter(
        (task) => task.employeeId === absence.employeeId && task.status === 'todo',
      );
      const activeTaskIds = new Set(activeTasks.map((task) => task.id));
      const decisions = Array.isArray(body.taskDecisions) ? body.taskDecisions : [];
      const seenTaskIds = new Set<string>();

      for (const decision of decisions) {
        if (!activeTaskIds.has(decision.taskId)) {
          return badRequest('Задача не найдена среди активных задач сотрудника');
        }
        if (seenTaskIds.has(decision.taskId)) {
          return badRequest('По одной задаче можно принять только одно решение');
        }
        seenTaskIds.add(decision.taskId);
        if (decision.action !== 'keep' && decision.action !== 'reassign') {
          return badRequest('Некорректное действие по задаче');
        }
        if (decision.action === 'reassign') {
          if (!decision.employeeId) {
            return badRequest('Выберите нового исполнителя задачи');
          }
          if (decision.employeeId === absence.employeeId) {
            return badRequest('Нельзя переназначить задачу на самого отсутствующего сотрудника');
          }
          const target = db.employees.find((item) => item.id === decision.employeeId);
          if (!target) return notFound('Новый исполнитель не найден');
          if (target.status === 'dismissed') {
            return badRequest('Нельзя назначить задачу уволенному сотруднику');
          }
          const task = activeTasks.find((item) => item.id === decision.taskId)!;
          const assigned = db.assignments.some(
            (assignment) =>
              assignment.projectId === task.projectId &&
              assignment.employeeId === target.id &&
              assignment.startDate <= absence.endDate &&
              (!assignment.endDate || assignment.endDate >= absence.startDate),
          );
          if (!assigned) {
            return badRequest('Новый исполнитель не назначен на проект');
          }
          const targetAbsence = findAbsenceOverlap(db.absences, {
            employeeId: target.id,
            startDate: absence.startDate,
            endDate: absence.endDate,
            statuses: ['approved'],
          });
          if (targetAbsence) {
            return badRequest(
              `У сотрудника согласовано отсутствие ${targetAbsence.startDate} — ${targetAbsence.endDate}`,
            );
          }
          if (assignmentLoadAt(db, target.id, absence.startDate) >= 100) {
            return badRequest('У сотрудника уже 100% загрузки — выберите другого исполнителя');
          }
        }
      }

      for (const decision of decisions) {
        const task = activeTasks.find((item) => item.id === decision.taskId)!;
        if (decision.action === 'reassign') {
          task.employeeId = decision.employeeId!;
        }
        const record: AbsenceTaskDecisionRecord = {
          id: nextId('atd', db.absenceTaskDecisions),
          absenceId: absence.id,
          taskId: task.id,
          action: decision.action,
          fromEmployeeId: absence.employeeId,
          toEmployeeId: decision.action === 'reassign' ? decision.employeeId! : null,
          comment: decision.comment?.trim() || undefined,
          byUserId: user.id,
          byUserName: user.name,
          at: new Date().toISOString(),
        };
        db.absenceTaskDecisions.push(record);
        pushAudit(
          db,
          user,
          decision.action === 'keep' ? 'Задача оставлена сотруднику' : 'Задача переназначена',
          'task',
          task.id,
          `${task.title}${
            decision.action === 'reassign'
              ? ` · ${fullName(db.employees.find((item) => item.id === decision.employeeId))}`
              : ' · на время отсутствия'
          }${decision.comment ? ` · ${decision.comment}` : ''}`,
        );
      }
    }
    absence.status = body.status;
    absence.approvedBy = body.status === 'approved' ? (user.employeeId ?? null) : null;
    if (absence.type === 'sick' && body.status === 'approved') {
      absence.confirmedAt = new Date().toISOString();
      absence.confirmedBy = user.employeeId ?? null;
    } else {
      absence.confirmedAt = null;
      absence.confirmedBy = null;
    }
    if (body.status === 'approved') clearAbsenceOverrides(db, absence);
    syncEmployeeStatus(db, absence.employeeId);
    syncAbsenceEvent(db, absence, user);
    const auditAction =
      body.status === 'approved'
        ? 'Согласовано отсутствие'
        : body.status === 'rejected'
          ? 'Отклонено отсутствие'
          : 'Заявка возвращена на согласование';
    pushAudit(
      db,
      user,
      auditAction,
      'absence',
      absence.id,
      absenceTypeMeta[absence.type].label,
    );
    notifyEmployee(db, absence.employeeId, {
      type: 'absence_decision',
      title:
        body.status === 'approved'
          ? 'Заявка согласована'
          : body.status === 'rejected'
            ? 'Заявка отклонена'
            : 'Заявка возвращена на согласование',
      body: `${absenceTypeMeta[absence.type].label}: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}`,
      link: '/absences',
    });
    saveDb(db);
    return HttpResponse.json(absence);
  }),

  http.patch(`${BASE}/absences/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const body = (await request.json()) as Partial<AbsencePayload>;
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound();
    if (absence.status === 'approved') {
      return badRequest(
        'Согласованную заявку нельзя редактировать. Верните её на согласование или отклоните.',
      );
    }
    const isApprover = canApproveAbsenceFor(db, user, absence);
    const isOwnPending =
      user.employeeId !== null &&
      user.employeeId !== undefined &&
      user.employeeId === absence.employeeId &&
      absence.status === 'pending';
    if (!isApprover && !isOwnPending) return forbidden('Недостаточно прав');
    if (body.type !== undefined && !ABSENCE_TYPES.includes(body.type)) {
      return badRequest('Некорректный тип отсутствия');
    }
    const startDate = body.startDate ?? absence.startDate;
    const endDate = body.endDate ?? absence.endDate;
    if (!dayjs(startDate).isValid() || !dayjs(endDate).isValid()) {
      return badRequest('Укажите корректные даты отсутствия');
    }
    if (endDate < startDate) return badRequest('Дата окончания раньше даты начала');
    const overlap = findAbsenceOverlap(db.absences, {
      employeeId: absence.employeeId,
      startDate,
      endDate,
      excludeId: absence.id,
    });
    if (overlap) {
      return badRequest(
        `Период пересекается с существующей заявкой ${overlap.startDate} — ${overlap.endDate}`,
      );
    }
    const nextType = body.type ?? absence.type;
    const vacationProblem = vacationLimitError(
      db,
      absence.employeeId,
      nextType,
      startDate,
      endDate,
      absence.id,
    );
    if (vacationProblem) return badRequest(vacationProblem);
    Object.assign(absence, pickFields(body, absenceUpdateFields));
    Object.assign(
      absence,
      absenceDayBreakdown(absence.type, absence.startDate, absence.endDate),
    );
    syncEmployeeStatus(db, absence.employeeId);
    syncAbsenceEvent(db, absence, user);
    pushAudit(
      db,
      user,
      'Изменена заявка на отсутствие',
      'absence',
      absence.id,
      absenceTypeMeta[absence.type].label,
    );
    saveDb(db);
    return HttpResponse.json(absence);
  }),

  http.delete(`${BASE}/absences/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound('Заявка не найдена');
    if (absence.status === 'approved') {
      return badRequest(
        'Согласованную заявку нельзя удалить. Сначала отклоните её или верните на согласование.',
      );
    }
    const isApprover = canApproveAbsenceFor(db, user, absence);
    const isOwnPending =
      user.employeeId !== null &&
      user.employeeId !== undefined &&
      user.employeeId === absence.employeeId &&
      absence.status === 'pending';
    if (!isApprover && !isOwnPending) return forbidden('Недостаточно прав');
    db.absences = db.absences.filter((item) => item.id !== absence.id);
    db.absenceTaskDecisions = db.absenceTaskDecisions.filter(
      (item) => item.absenceId !== absence.id,
    );
    db.events = db.events.filter((event) => event.absenceId !== absence.id);
    syncEmployeeStatus(db, absence.employeeId);
    pushAudit(
      db,
      user,
      'Удалена заявка на отсутствие',
      'absence',
      absence.id,
      absenceTypeMeta[absence.type].label,
    );
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),

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
    items.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    if (user.role !== 'admin' && user.role !== 'hr') {
      items = items.map(({ oldSalary: _oldSalary, newSalary: _newSalary, ...event }) => event);
    }
    return HttpResponse.json(items);
  }),

  http.post(`${BASE}/events`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'events:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as HrEventPayload;
    if (body.type === 'dismissal' && !can(user.role, 'employees:dismiss')) {
      return forbidden('Увольнение доступно администратору');
    }
    if (!HR_EVENT_TYPES.includes(body.type)) {
      return badRequest('Некорректный тип кадрового события');
    }
    if (!dayjs(body.date).isValid()) {
      return badRequest('Укажите корректную дату события');
    }
    if (!body.title?.trim()) {
      return badRequest('Укажите название события');
    }
    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (body.type === 'hire' && employee.status === 'dismissed' && !can(user.role, 'employees:dismiss')) {
      return forbidden('Повторный приём уволенного сотрудника доступен администратору');
    }
    if (body.type === 'dismissal') {
      const blocker = dismissalBlocker(db, employee.id);
      if (blocker) return badRequest(blocker);
    }
    const currentPosition = db.positions.find((item) => item.id === employee.positionId);

    let eventSalary = body.newSalary ?? null;
    let promotionPosition: (typeof db.positions)[number] | null = null;

    if (body.type === 'promotion') {
      if (!body.toPositionId) return badRequest('Выберите новую должность');
      promotionPosition =
        db.positions.find((item) => item.id === body.toPositionId) ?? null;
      if (!promotionPosition) return badRequest('Должность не найдена');
      if (promotionPosition.id === employee.positionId) {
        return badRequest('Новая должность должна отличаться от текущей');
      }
      if (promotionPosition.departmentId !== employee.departmentId) {
        return badRequest('Повышение возможно только в своём подразделении');
      }
      if (currentPosition && promotionPosition.family !== currentPosition.family) {
        return badRequest('Повышение возможно только в своей профессиональной ветке');
      }
      if (currentPosition && promotionPosition.grade <= currentPosition.grade) {
        return badRequest('Новая должность должна быть выше по грейду');
      }
      eventSalary = can(user.role, 'salary:write')
        ? (body.newSalary ?? promotionPosition.salaryMin)
        : promotionPosition.salaryMin;
    } else if (body.type === 'salary_change') {
      if (!can(user.role, 'salary:write')) {
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
      !can(user.role, 'salary:write')
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
      const targetDepartmentId = body.toDepartmentId ?? employee.departmentId;
      if (body.toPositionId) {
        const problem = checkPositionForDepartment(db, targetDepartmentId, body.toPositionId);
        if (problem) return badRequest(problem);
      } else if (body.toDepartmentId && body.toDepartmentId !== employee.departmentId) {
        return badRequest('Для перевода в другое подразделение выберите должность');
      }
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

  http.get(`${BASE}/users`, ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (actor.role !== 'admin') return forbidden();
    return HttpResponse.json(db.users);
  }),

  http.get(`${BASE}/users/by-employee/:employeeId`, ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (!canManageAccounts(actor.role)) return forbidden();
    const user = db.users.find((item) => item.employeeId === params.employeeId) ?? null;
    return HttpResponse.json(user);
  }),

  http.post(`${BASE}/users`, async ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (!canManageAccounts(actor.role)) return forbidden();

    const body = (await request.json()) as CreateUserPayload;
    const role = body.role ?? 'employee';
    if (!ROLES.includes(role)) {
      return badRequest('Некорректная роль пользователя');
    }
    if (actor.role === 'hr' && role !== 'employee') {
      return forbidden('HR может создавать только учётные записи сотрудников');
    }
    if (!body.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return badRequest('Укажите корректный email для входа');
    }

    const email = body.email.trim().toLowerCase();
    if (db.users.some((item) => item.email.toLowerCase() === email)) {
      return badRequest('Пользователь с таким email уже существует');
    }

    const employee = body.employeeId
      ? db.employees.find((item) => item.id === body.employeeId)
      : null;
    if (body.employeeId && !employee) return notFound('Сотрудник не найден');
    if (employee && employee.status === 'dismissed') {
      return badRequest('Нельзя создать доступ уволенному сотруднику');
    }
    if (employee && db.users.some((item) => item.employeeId === employee.id)) {
      return badRequest('У этого сотрудника уже есть учётная запись');
    }

    const temporaryPassword = generateTemporaryPassword();
    const user: User = {
      id: nextId('u', db.users),
      email,
      name: body.name?.trim() || (employee ? fullName(employee) : email.split('@')[0]),
      role,
      employeeId: employee?.id ?? null,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: null,
    };
    db.users.push(user);
    db.passwordHashes[user.id] = hashPassword(temporaryPassword, user.id);
    pushAudit(
      db,
      actor,
      'Создана учётная запись',
      'user',
      user.id,
      `${user.email} · ${roleLabels[user.role]}${employee ? ` · ${fullName(employee)}` : ''}`,
    );
    saveDb(db);

    const response: CreateUserResponse = { user, temporaryPassword };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.patch(`${BASE}/users/:id`, async ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized();
    if (actor.role !== 'admin') return forbidden();

    const body = (await request.json()) as Partial<Pick<User, 'role' | 'isActive'>>;
    const user = db.users.find((item) => item.id === params.id);
    if (!user) return notFound();
    if (body.role !== undefined && !ROLES.includes(body.role)) {
      return badRequest('Некорректная роль пользователя');
    }
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      return badRequest('Некорректное значение блокировки');
    }
    if (user.id === actor.id && body.isActive === false) {
      return badRequest('Нельзя заблокировать собственную учётную запись');
    }
    const activeAdmins = db.users.filter(
      (item) => item.role === 'admin' && item.isActive,
    ).length;
    const losesAdmin =
      user.role === 'admin' &&
      user.isActive &&
      ((body.role !== undefined && body.role !== 'admin') || body.isActive === false);
    if (losesAdmin && activeAdmins <= 1) {
      return badRequest('В системе должен остаться хотя бы один активный администратор');
    }
    Object.assign(user, pickFields(body, ['role', 'isActive'] as const));
    pushAudit(db, actor, 'Изменён пользователь', 'user', user.id, user.email);
    saveDb(db);
    return HttpResponse.json(user);
  }),

  http.get(`${BASE}/audit`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'audit:read')) return forbidden('Недостаточно прав');
    return HttpResponse.json([...db.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200));
  }),

  http.post(`${BASE}/demo/reset`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role !== 'admin') return forbidden('Недостаточно прав');
    resetDb();
    return HttpResponse.json({ ok: true });
  }),
];
