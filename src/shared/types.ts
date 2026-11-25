export type Role = 'admin' | 'hr' | 'manager' | 'employee';

export type EmployeeStatus = 'active' | 'probation' | 'vacation' | 'sick_leave' | 'dismissed';
export type Gender = 'male' | 'female';
export type EmploymentType = 'full' | 'part' | 'contract';

export interface Employee {
  id: string;
  personnelNumber: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate: string;
  gender: Gender;
  email: string;
  phone: string;
  departmentId: string;
  positionId: string;
  managerId?: string | null;
  /** ФИО руководителя, рассчитанное сервером (нужно сотруднику для своей карточки). */
  managerName?: string | null;
  hireDate: string;
  dismissalDate?: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  salary: number;
  education?: string;
  notes?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  parentId?: string | null;
  headId?: string | null;
  description?: string;
}

export interface Position {
  id: string;
  name: string;
  departmentId: string;
  family: string;
  grade: number;
  salaryMin: number;
  salaryMax: number;
}

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';

export interface Project {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  startDate: string;
  endDate?: string | null;
  managerId?: string | null;
  /**
   * ФИО руководителя, рассчитанное сервером. Нужно для каталога проектов:
   * manager видит чужой проект, но не имеет доступа к карточке его руководителя.
   */
  managerName?: string | null;
  color: string;
}

export interface Assignment {
  id: string;
  projectId: string;
  employeeId: string;
  projectRole: string;
  allocation: number;
  startDate: string;
  endDate?: string | null;
  /** Причина, по которой администратор разрешил загрузку выше 100%. */
  overloadReason?: string;
}

export type ProjectTaskStatus = 'todo' | 'done';

interface TaskCarryEntry {
  from: string;
  to: string;
  at: string;
}

type TaskCompletionAction = 'done' | 'reopen';

interface TaskCompletionEntry {
  action: TaskCompletionAction;
  comment: string;
  at: string;
  byId: string;
  byName: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  employeeId: string;
  title: string;
  description?: string;
  /** Плановая дата выполнения; переносится при «нужно больше времени». */
  dueDate: string;
  estimateHours?: number | null;
  status: ProjectTaskStatus;
  createdById: string;
  createdByName: string;
  createdAt: string;
  completedAt?: string | null;
  /** Комментарий результата — что именно сделал сотрудник. */
  completionComment?: string;
  completedById?: string | null;
  completedByName?: string | null;
  completionHistory?: TaskCompletionEntry[];
  /** Исходная плановая дата до переносов. */
  originalDueDate: string;
  carryCount: number;
  carryHistory: TaskCarryEntry[];
}

export interface TaskHandoverCandidate {
  employeeId: string;
  employeeName: string;
  projectRole?: string;
  load: number;
  note?: string;
}

export interface TaskHandoverTask {
  task: ProjectTask;
  candidates: TaskHandoverCandidate[];
}

export interface AbsenceTaskHandover {
  absenceId: string;
  tasks: TaskHandoverTask[];
}

export interface AbsenceTaskDecision {
  taskId: string;
  action: 'keep' | 'reassign';
  employeeId?: string;
  comment?: string;
}

export type TimesheetCode = 'Я' | 'ОТ' | 'Б' | 'К' | 'П' | 'Н' | 'В' | '—';
export type TimesheetStatus = 'draft' | 'submitted' | 'approved';
export type CalendarDayKind =
  | 'workday'
  | 'weekend'
  | 'holiday'
  | 'transferred_off'
  | 'working_saturday'
  | 'shortened';

export interface TimesheetCell {
  date: string;
  code: TimesheetCode;
  hours: number;
  isOverride: boolean;
  absenceId?: string;
  dayType?: CalendarDayKind;
  holidayName?: string;
}

export interface TimesheetRow {
  employeeId: string;
  days: TimesheetCell[];
  normDays: number;
  workedDays: number;
  vacationDays: number;
  sickDays: number;
  tripDays: number;
  absentDays: number;
  totalHours: number;
  status: TimesheetStatus;
}

export interface TimesheetResponse {
  month: string;
  normDays: number;
  normHours: number;
  rows: TimesheetRow[];
}

export type AbsenceType = 'vacation' | 'sick' | 'business_trip' | 'unpaid' | 'study';
export type AbsenceStatus = 'pending' | 'approved' | 'rejected';

export interface Absence {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  /** Дни в зависимости от типа: отпуск/без сохранения — календарные без праздников, больничный — календарные, командировка/учёба — рабочие. */
  days: number;
  workingDays?: number;
  calendarDays?: number;
  status: AbsenceStatus;
  reason?: string;
  createdAt: string;
  approvedBy?: string | null;
  /** Больничный подтверждён HR/администратором. */
  confirmedAt?: string | null;
  confirmedBy?: string | null;
}

export type HrEventType =
  | 'hire'
  | 'transfer'
  | 'promotion'
  | 'dismissal'
  | 'salary_change'
  | 'vacation'
  | 'sick_leave'
  | 'business_trip'
  | 'unpaid_leave';

export interface HrEvent {
  id: string;
  employeeId: string;
  type: HrEventType;
  date: string;
  title: string;
  description?: string;
  fromDepartmentId?: string | null;
  toDepartmentId?: string | null;
  fromPositionId?: string | null;
  toPositionId?: string | null;
  oldSalary?: number | null;
  newSalary?: number | null;
  authorId?: string | null;
  /** Заявка на отсутствие, по которой создано событие (для синхронизации). */
  absenceId?: string | null;
}

type NotificationType =
  | 'absence_request'
  | 'absence_decision'
  | 'task_assigned'
  | 'task_completed'
  | 'project_transfer'
  | 'account';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  createdAt: string;
  readAt?: string | null;
}

export interface VacationBalance {
  id: string;
  employeeId: string;
  year: number;
  entitlement: number;
  carryover: number;
  updatedAt: string;
}

export interface VacationBalanceView extends VacationBalance {
  used: number;
  planned: number;
  remaining: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId?: string | null;
  isActive: boolean;
  /** Временный пароль ещё не заменён пользователем. */
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
}

/** История решения по задаче при согласовании отсутствия. */
export interface AbsenceTaskDecisionRecord extends AbsenceTaskDecision {
  id: string;
  absenceId: string;
  fromEmployeeId: string;
  toEmployeeId?: string | null;
  byUserId: string;
  byUserName: string;
  at: string;
}

interface TimesheetOverride {
  date: string;
  code: TimesheetCode;
  hours: number;
}

export interface Db {
  employees: Employee[];
  departments: Department[];
  positions: Position[];
  projects: Project[];
  assignments: Assignment[];
  projectTasks: ProjectTask[];
  absences: Absence[];
  absenceTaskDecisions: AbsenceTaskDecisionRecord[];
  vacationBalances: VacationBalance[];
  events: HrEvent[];
  users: User[];
  notifications: Notification[];
  audit: AuditEntry[];
  timesheetOverrides: Record<string, TimesheetOverride[]>;
  timesheetStatuses: Record<string, TimesheetStatus>;
  /** userId → непрозрачный хеш пароля (в моке — демонстрационный). */
  passwordHashes: Record<string, string>;
  seededAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmployeeQuery {
  search?: string;
  departmentId?: string;
  positionId?: string;
  status?: EmployeeStatus | '';
  projectId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'hireDate' | 'salary';
  sortDir?: 'asc' | 'desc';
}

export interface DashboardData {
  headcount: number;
  probation: number;
  hiredThisMonth: number;
  dismissedThisMonth: number;
  activeProjects: number;
  avgUtilization: number;
  absentToday: number;
  pendingAbsences: number;
  byDepartment: { name: string; count: number }[];
  dynamics: { month: string; hired: number; dismissed: number }[];
  teamByProject: { name: string; count: number }[];
  birthdays: { employeeId: string; date: string; daysLeft: number }[];
  recentEvents: HrEvent[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface CreateUserPayload {
  email: string;
  name?: string;
  role: Role;
  employeeId?: string | null;
}

export interface CreateUserResponse {
  user: User;
  /** Временный пароль показывается один раз и хранится только в виде хеша. */
  temporaryPassword: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface EmployeePayload {
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate: string;
  gender: Gender;
  email: string;
  phone: string;
  departmentId: string;
  positionId: string;
  managerId?: string | null;
  hireDate: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  salary: number;
  education?: string;
}

export interface DepartmentPayload {
  name: string;
  code: string;
  parentId?: string | null;
  headId?: string | null;
  description?: string;
}

export interface PositionPayload {
  name: string;
  departmentId: string;
  family: string;
  grade: number;
  salaryMin: number;
  salaryMax: number;
}

export interface ProjectPayload {
  code: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  startDate: string;
  endDate?: string | null;
  managerId?: string | null;
  color: string;
}

export interface AssignmentPayload {
  projectId: string;
  employeeId: string;
  projectRole: string;
  allocation: number;
  startDate: string;
  endDate?: string | null;
  overloadReason?: string;
}

export interface ProjectTaskPayload {
  projectId: string;
  employeeId: string;
  title: string;
  description?: string;
  dueDate: string;
  estimateHours?: number | null;
}

export interface ProjectTaskUpdatePayload {
  title?: string;
  description?: string;
  dueDate?: string;
  estimateHours?: number | null;
  status?: ProjectTaskStatus;
  /** Переназначить задачу на другого участника проекта. */
  employeeId?: string;
  /** Перенести задачу на следующий рабочий день. */
  postpone?: boolean;
  /** Комментарий результата при закрытии задачи. */
  completionComment?: string;
}

export interface ProjectTaskQuery {
  employeeId?: string;
  projectId?: string;
  status?: ProjectTaskStatus | '';
  mine?: boolean;
}

export interface AbsencePayload {
  employeeId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface HrEventPayload {
  employeeId: string;
  type: HrEventType;
  date: string;
  title: string;
  description?: string;
  toDepartmentId?: string | null;
  toPositionId?: string | null;
  newSalary?: number | null;
}
