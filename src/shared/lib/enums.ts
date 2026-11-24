import type {
  AbsenceStatus,
  AbsenceType,
  EmployeeStatus,
  EmploymentType,
  Gender,
  HrEventType,
  ProjectStatus,
  ProjectTaskStatus,
  Role,
  TimesheetStatus,
} from '@/shared/types';

/**
 * Единственный источник допустимых значений для API, миграций и форм.
 * `satisfies` не даёт списку разойтись с типом-объединением.
 */
export const ROLES = ['admin', 'hr', 'manager', 'employee'] as const satisfies readonly Role[];

export const EMPLOYEE_STATUSES = [
  'active',
  'probation',
  'vacation',
  'sick_leave',
  'dismissed',
] as const satisfies readonly EmployeeStatus[];

export const EMPLOYMENT_TYPES = [
  'full',
  'part',
  'contract',
] as const satisfies readonly EmploymentType[];

export const GENDERS = ['male', 'female'] as const satisfies readonly Gender[];

export const PROJECT_STATUSES = [
  'planning',
  'active',
  'paused',
  'completed',
] as const satisfies readonly ProjectStatus[];

export const PROJECT_TASK_STATUSES = ['todo', 'done'] as const satisfies readonly ProjectTaskStatus[];

export const ABSENCE_TYPES = [
  'vacation',
  'sick',
  'business_trip',
  'unpaid',
  'study',
] as const satisfies readonly AbsenceType[];

export const ABSENCE_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const satisfies readonly AbsenceStatus[];

export const TIMESHEET_STATUSES = [
  'draft',
  'submitted',
  'approved',
] as const satisfies readonly TimesheetStatus[];

/** Профессиональные ветки внутри подразделений. */
export const POSITION_FAMILIES = [
  'Руководство',
  'HR',
  'Финансы',
  'QA',
  'Backend',
  'Frontend',
  'Аналитика',
  'Дизайн',
  'Маркетинг',
  'Продажи',
  'IT',
  'Административный',
] as const;

/** Грейды: 1 — начальный, 2 — специалист, 3 — старший, 4 — ведущий. */
export const POSITION_GRADES = [1, 2, 3, 4] as const;

export const POSITION_GRADE_LABELS: Record<number, string> = {
  1: 'Начальный',
  2: 'Специалист',
  3: 'Старший',
  4: 'Ведущий',
};

export const HR_EVENT_TYPES = [
  'hire',
  'transfer',
  'promotion',
  'dismissal',
  'salary_change',
  'vacation',
  'sick_leave',
  'business_trip',
  'unpaid_leave',
] as const satisfies readonly HrEventType[];
