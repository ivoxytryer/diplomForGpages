import type {
  AbsencePayload,
  AssignmentPayload,
  DepartmentPayload,
  EmployeePayload,
  PositionPayload,
  ProjectPayload,
} from '@/shared/types';

/**
 * Граница API: из тела запроса берём только поля, которые разрешено менять.
 * Иначе клиент может подменить id, служебные поля или статус в обход сценария.
 */
export function pickFields<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

export const employeeFields = [
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

export const personalEmployeeFields = [
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

export const departmentFields = [
  'name',
  'code',
  'parentId',
  'headId',
  'description',
] as const satisfies readonly (keyof DepartmentPayload)[];

export const positionFields = [
  'name',
  'departmentId',
  'family',
  'grade',
  'salaryMin',
  'salaryMax',
] as const satisfies readonly (keyof PositionPayload)[];

export const projectFields = [
  'code',
  'name',
  'description',
  'status',
  'startDate',
  'endDate',
  'managerId',
  'color',
] as const satisfies readonly (keyof ProjectPayload)[];

export const assignmentFields = [
  'projectId',
  'employeeId',
  'projectRole',
  'allocation',
  'startDate',
  'endDate',
  'overloadReason',
] as const satisfies readonly (keyof AssignmentPayload)[];

export const absenceFields = [
  'employeeId',
  'type',
  'startDate',
  'endDate',
  'reason',
] as const satisfies readonly (keyof AbsencePayload)[];

export const absenceUpdateFields = [
  'type',
  'startDate',
  'endDate',
  'reason',
] as const satisfies readonly (keyof AbsencePayload)[];
