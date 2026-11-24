import { apiClient } from './client';
import type {
  Absence,
  AbsencePayload,
  AbsenceStatus,
  AbsenceTaskDecision,
  AbsenceTaskHandover,
  Assignment,
  AssignmentPayload,
  AuditEntry,
  AuthResponse,
  ChangePasswordPayload,
  CreateUserPayload,
  CreateUserResponse,
  DashboardData,
  Department,
  DepartmentPayload,
  Employee,
  EmployeePayload,
  EmployeeQuery,
  HrEvent,
  HrEventPayload,
  LoginPayload,
  Notification,
  Paginated,
  Position,
  PositionPayload,
  Project,
  ProjectPayload,
  ProjectTask,
  ProjectTaskPayload,
  ProjectTaskQuery,
  ProjectTaskUpdatePayload,
  Role,
  TimesheetResponse,
  TimesheetStatus,
  User,
  VacationBalanceView,
} from '@/shared/types';
import { ROLES } from '@/shared/lib/enums';

function get<T>(url: string, params?: object) {
  return apiClient.get<T>(url, { params }).then((response) => response.data);
}

function post<T>(url: string, body?: unknown) {
  return apiClient.post<T>(url, body).then((response) => response.data);
}

function patch<T>(url: string, body?: unknown) {
  return apiClient.patch<T>(url, body).then((response) => response.data);
}

function del<T>(url: string) {
  return apiClient.delete<T>(url).then((response) => response.data);
}

/**
 * Списочные ответы приводим к массиву. Если API временно вернул не JSON-массив
 * (например, HTML-заглушку при перезапуске service worker), страница не падает.
 */
function getList<T>(url: string, params?: object) {
  return get<unknown>(url, params).then((data) =>
    Array.isArray(data) ? (data as T[]) : ([] as T[]),
  );
}

function normalizePage<T>(data: unknown, params: EmployeeQuery): Paginated<T> {
  const value = data && typeof data === 'object' ? (data as Partial<Paginated<T>>) : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    items,
    total: typeof value.total === 'number' ? value.total : items.length,
    page: typeof value.page === 'number' ? value.page : (params.page ?? 1),
    pageSize:
      typeof value.pageSize === 'number' ? value.pageSize : (params.pageSize ?? 20),
  };
}

function normalizeTimesheet(data: unknown, month: string): TimesheetResponse {
  const value = data && typeof data === 'object' ? (data as Partial<TimesheetResponse>) : {};
  return {
    month: typeof value.month === 'string' ? value.month : month,
    normDays: typeof value.normDays === 'number' ? value.normDays : 0,
    normHours: typeof value.normHours === 'number' ? value.normHours : 0,
    rows: Array.isArray(value.rows) ? value.rows : [],
  };
}

function normalizeDashboard(data: unknown): DashboardData {
  const value = data && typeof data === 'object' ? (data as Partial<DashboardData>) : {};
  const number = (input: unknown) =>
    typeof input === 'number' && Number.isFinite(input) ? input : 0;
  const array = <T,>(input: unknown): T[] =>
    Array.isArray(input) ? (input as T[]) : [];
  return {
    headcount: number(value.headcount),
    probation: number(value.probation),
    hiredThisMonth: number(value.hiredThisMonth),
    dismissedThisMonth: number(value.dismissedThisMonth),
    activeProjects: number(value.activeProjects),
    avgUtilization: number(value.avgUtilization),
    absentToday: number(value.absentToday),
    pendingAbsences: number(value.pendingAbsences),
    byDepartment: array(value.byDepartment),
    dynamics: array(value.dynamics),
    teamByProject: array(value.teamByProject),
    birthdays: array(value.birthdays),
    recentEvents: array(value.recentEvents),
  };
}

function normalizeUser(data: unknown): User | null {
  if (!data || typeof data !== 'object') return null;
  const user = data as Partial<User>;
  const role =
    typeof user.role === 'string' && (ROLES as readonly string[]).includes(user.role)
      ? (user.role as Role)
      : null;
  return typeof user.id === 'string' && role ? ({ ...user, role } as User) : null;
}

export const api = {
  auth: {
    login: async (payload: LoginPayload) => {
      const data = (await post<unknown>('/auth/login', payload)) as Partial<AuthResponse>;
      const user = normalizeUser(data?.user);
      if (!user || typeof data?.token !== 'string') {
        throw new Error('Некорректный ответ сервера при входе');
      }
      return { token: data.token, user };
    },
    me: async () => {
      const user = normalizeUser(await get<unknown>('/auth/me'));
      if (!user) throw new Error('Некорректный ответ сервера авторизации');
      return user;
    },
    changePassword: async (payload: ChangePasswordPayload) => {
      const user = normalizeUser(await post<unknown>('/auth/change-password', payload));
      if (!user) throw new Error('Некорректный ответ сервера');
      return user;
    },
  },

  employees: {
    list: (params: EmployeeQuery = {}) =>
      get<unknown>('/employees', params).then((data) => normalizePage<Employee>(data, params)),
    get: (id: string) => get<Employee>(`/employees/${id}`),
    create: (payload: EmployeePayload) => post<Employee>('/employees', payload),
    update: (id: string, payload: Partial<EmployeePayload>) =>
      patch<Employee>(`/employees/${id}`, payload),
    remove: (id: string) => del<{ ok: true }>(`/employees/${id}`),
  },

  departments: {
    list: () => getList<Department>('/departments'),
    create: (payload: DepartmentPayload) => post<Department>('/departments', payload),
    update: (id: string, payload: Partial<DepartmentPayload>) =>
      patch<Department>(`/departments/${id}`, payload),
    remove: (id: string) => del<{ ok: true }>(`/departments/${id}`),
  },

  positions: {
    list: () => getList<Position>('/positions'),
    create: (payload: PositionPayload) => post<Position>('/positions', payload),
    update: (id: string, payload: Partial<PositionPayload>) =>
      patch<Position>(`/positions/${id}`, payload),
    remove: (id: string) => del<{ ok: true }>(`/positions/${id}`),
  },

  projects: {
    list: () => getList<Project>('/projects'),
    get: (id: string) => get<Project>(`/projects/${id}`),
    create: (payload: ProjectPayload) => post<Project>('/projects', payload),
    update: (id: string, payload: Partial<ProjectPayload>) =>
      patch<Project>(`/projects/${id}`, payload),
    remove: (id: string) => del<{ ok: true }>(`/projects/${id}`),
  },

  assignments: {
    list: (params: { employeeId?: string; projectId?: string } = {}) =>
      getList<Assignment>('/assignments', params),
    create: (payload: AssignmentPayload) => post<Assignment>('/assignments', payload),
    update: (id: string, payload: Partial<AssignmentPayload>) =>
      patch<Assignment>(`/assignments/${id}`, payload),
    remove: (id: string) => del<{ ok: true }>(`/assignments/${id}`),
  },

  tasks: {
    list: (params: ProjectTaskQuery = {}) => getList<ProjectTask>('/tasks', params),
    create: (payload: ProjectTaskPayload) => post<ProjectTask>('/tasks', payload),
    update: (id: string, payload: ProjectTaskUpdatePayload) =>
      patch<ProjectTask>(`/tasks/${id}`, payload),
    remove: (id: string) => del<{ ok: true }>(`/tasks/${id}`),
  },

  timesheet: {
    get: (params: { month: string; departmentId?: string; employeeId?: string }) =>
      get<unknown>('/timesheet', params).then((data) =>
        normalizeTimesheet(data, params.month),
      ),
    setCell: (employeeId: string, date: string, payload: { code: string; hours: number }) =>
      patch<{ ok: true }>(`/timesheet/${employeeId}/${date}`, payload),
    setStatus: (employeeId: string, month: string, status: TimesheetStatus) =>
      patch<{ ok: true }>(`/timesheet/${employeeId}/status`, { month, status }),
  },

  absences: {
    list: (params: { employeeId?: string; status?: AbsenceStatus | ''; month?: string } = {}) =>
      getList<Absence>('/absences', params),
    create: (payload: AbsencePayload) => post<Absence>('/absences', payload),
    update: (id: string, payload: Partial<AbsencePayload>) =>
      patch<Absence>(`/absences/${id}`, payload),
    setStatus: (id: string, status: AbsenceStatus, taskDecisions?: AbsenceTaskDecision[]) =>
      patch<Absence>(`/absences/${id}/status`, { status, taskDecisions }),
    taskHandover: (id: string) =>
      get<AbsenceTaskHandover>(`/absences/${id}/task-handover`),
    remove: (id: string) => del<{ ok: true }>(`/absences/${id}`),
  },

  events: {
    list: (params: { employeeId?: string; month?: string; type?: string } = {}) =>
      getList<HrEvent>('/events', params),
    create: (payload: HrEventPayload) => post<HrEvent>('/events', payload),
  },

  dashboard: {
    get: (departmentId?: string) =>
      get<unknown>('/dashboard', departmentId ? { departmentId } : undefined).then(
        normalizeDashboard,
      ),
  },

  users: {
    list: () => getList<User>('/users'),
    getByEmployee: (employeeId: string) =>
      get<User | null>(`/users/by-employee/${employeeId}`),
    create: (payload: CreateUserPayload) =>
      post<CreateUserResponse>('/users', payload),
    update: (id: string, payload: Partial<Pick<User, 'role' | 'isActive'>>) =>
      patch<User>(`/users/${id}`, payload),
  },

  notifications: {
    list: (params: { unread?: boolean } = {}) =>
      getList<Notification>('/notifications', params),
    markRead: (id: string) => patch<Notification>(`/notifications/${id}/read`),
    markAllRead: () => patch<{ ok: true }>('/notifications/read-all'),
  },

  vacations: {
    balances: (params: { year?: number; employeeId?: string } = {}) =>
      getList<VacationBalanceView>('/vacations/balance', params),
    updateBalance: (
      employeeId: string,
      payload: { year: number; entitlement: number; carryover: number },
    ) => patch<VacationBalanceView>(`/vacations/balance/${employeeId}`, payload),
  },

  audit: {
    list: () => getList<AuditEntry>('/audit'),
  },

  demo: {
    reset: () => post<{ ok: true }>('/demo/reset'),
  },
};
