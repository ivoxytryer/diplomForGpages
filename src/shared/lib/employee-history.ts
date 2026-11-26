import type { Department, Employee, HrEvent, Position } from '@/shared/types';
import { fullName } from './utils';

export interface HistoryEntry {
  id: string;
  date: string;
  type: HrEvent['type'];
  title: string;
  description?: string;
  departmentName?: string;
  positionName?: string;
  grade?: number;
  fromDepartmentName?: string;
  toDepartmentName?: string;
  fromPositionName?: string;
  toPositionName?: string;
  fromGrade?: number;
  toGrade?: number;
  oldSalary?: number | null;
  newSalary?: number | null;
  authorName?: string;
}

export interface SalaryStep {
  date: string;
  salary: number;
  eventId: string;
  label: string;
  grade?: number;
}

export interface EmployeeHistory {
  entries: HistoryEntry[];
  salarySteps: SalaryStep[];
}

export interface EmployeeHistoryInput {
  events: HrEvent[];
  employee: Employee;
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  canViewSalary: boolean;
}

/**
 * Собирает послужной список из кадровых событий.
 * Таблица идёт от новых к старым, а шаги оклада — по возрастанию даты.
 */
export function buildEmployeeHistory(input: EmployeeHistoryInput): EmployeeHistory {
  const departmentById = new Map(
    input.departments.map((department) => [department.id, department.name]),
  );
  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const currentPosition = positionById.get(input.employee.positionId);

  const nameOfDepartment = (id?: string | null) => (id ? departmentById.get(id) : undefined);
  const nameOfPosition = (id?: string | null) => (id ? positionById.get(id)?.name : undefined);
  const gradeOfPosition = (id?: string | null) => (id ? positionById.get(id)?.grade : undefined);

  const events = [...input.events].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id),
  );

  // Должность на момент события. Нужно для salary_change: в самом событии
  // нет positionId, поэтому берём последнюю должность по хронологии.
  let runningPositionId = input.employee.positionId;
  let runningDepartmentId = input.employee.departmentId;
  const positionAtEvent = new Map<string, { positionId?: string; departmentId?: string }>();
  events.forEach((event) => {
    positionAtEvent.set(event.id, {
      positionId:
        event.type === 'salary_change'
          ? runningPositionId
          : event.toPositionId ?? event.fromPositionId ?? runningPositionId,
      departmentId:
        event.type === 'salary_change'
          ? runningDepartmentId
          : event.toDepartmentId ?? event.fromDepartmentId ?? runningDepartmentId,
    });
    if (event.toPositionId) runningPositionId = event.toPositionId;
    if (event.toDepartmentId) runningDepartmentId = event.toDepartmentId;
  });

  const entries: HistoryEntry[] = events
    .map((event) => {
      const author = event.authorId ? employeeById.get(event.authorId) : null;
      const isSalaryOnly = event.type === 'salary_change';
      const atEvent = positionAtEvent.get(event.id);
      const departmentName =
        nameOfDepartment(event.toDepartmentId) ??
        nameOfDepartment(event.fromDepartmentId) ??
        (isSalaryOnly ? nameOfDepartment(atEvent?.departmentId) : undefined);
      const positionName =
        nameOfPosition(event.toPositionId) ??
        nameOfPosition(event.fromPositionId) ??
        (isSalaryOnly ? nameOfPosition(atEvent?.positionId) : undefined);
      const grade =
        gradeOfPosition(event.toPositionId) ??
        gradeOfPosition(event.fromPositionId) ??
        (isSalaryOnly ? gradeOfPosition(atEvent?.positionId) : undefined);

      return {
        id: event.id,
        date: event.date,
        type: event.type,
        title: event.title,
        description: event.description,
        departmentName,
        positionName,
        grade,
        fromDepartmentName: nameOfDepartment(event.fromDepartmentId),
        toDepartmentName: nameOfDepartment(event.toDepartmentId),
        fromPositionName: nameOfPosition(event.fromPositionId),
        toPositionName: nameOfPosition(event.toPositionId),
        fromGrade: gradeOfPosition(event.fromPositionId),
        toGrade: gradeOfPosition(event.toPositionId),
        oldSalary: input.canViewSalary ? event.oldSalary : undefined,
        newSalary: input.canViewSalary ? event.newSalary : undefined,
        authorName: author ? fullName(author) : undefined,
      };
    })
    .reverse();

  const salarySteps: SalaryStep[] = [];
  if (input.canViewSalary) {
    events.forEach((event) => {
      if (event.newSalary === null || event.newSalary === undefined) return;
      if (!['hire', 'transfer', 'promotion', 'salary_change'].includes(event.type)) return;

      const grade =
        gradeOfPosition(event.toPositionId) ??
        gradeOfPosition(event.fromPositionId) ??
        gradeOfPosition(positionAtEvent.get(event.id)?.positionId);

      if (!salarySteps.length && event.oldSalary !== null && event.oldSalary !== undefined) {
        salarySteps.push({
          date: input.employee.hireDate,
          salary: event.oldSalary,
          eventId: `${event.id}-before`,
          label: 'Оклад до изменения',
          grade,
        });
      }
      salarySteps.push({
        date: event.date,
        salary: event.newSalary,
        eventId: event.id,
        label: event.title,
        grade,
      });
    });

    if (!salarySteps.length) {
      salarySteps.push({
        date: input.employee.hireDate,
        salary: input.employee.salary,
        eventId: 'current',
        label: 'Текущий оклад',
        grade: currentPosition?.grade,
      });
    }
  }

  return { entries, salarySteps };
}
