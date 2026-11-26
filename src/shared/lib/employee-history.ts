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
  fromDepartmentName?: string;
  toDepartmentName?: string;
  fromPositionName?: string;
  toPositionName?: string;
  oldSalary?: number | null;
  newSalary?: number | null;
  authorName?: string;
}

export interface SalaryStep {
  date: string;
  salary: number;
  eventId: string;
  label: string;
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
  const positionById = new Map(input.positions.map((position) => [position.id, position.name]));
  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));

  const nameOfDepartment = (id?: string | null) => (id ? departmentById.get(id) : undefined);
  const nameOfPosition = (id?: string | null) => (id ? positionById.get(id) : undefined);

  const events = [...input.events].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id),
  );

  const entries: HistoryEntry[] = events
    .map((event) => {
      const author = event.authorId ? employeeById.get(event.authorId) : null;
      return {
        id: event.id,
        date: event.date,
        type: event.type,
        title: event.title,
        description: event.description,
        departmentName:
          nameOfDepartment(event.toDepartmentId) ?? nameOfDepartment(event.fromDepartmentId),
        positionName:
          nameOfPosition(event.toPositionId) ?? nameOfPosition(event.fromPositionId),
        fromDepartmentName: nameOfDepartment(event.fromDepartmentId),
        toDepartmentName: nameOfDepartment(event.toDepartmentId),
        fromPositionName: nameOfPosition(event.fromPositionId),
        toPositionName: nameOfPosition(event.toPositionId),
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

      if (!salarySteps.length && event.oldSalary !== null && event.oldSalary !== undefined) {
        salarySteps.push({
          date: input.employee.hireDate,
          salary: event.oldSalary,
          eventId: `${event.id}-before`,
          label: 'Оклад до изменения',
        });
      }
      salarySteps.push({
        date: event.date,
        salary: event.newSalary,
        eventId: event.id,
        label: event.title,
      });
    });

    if (!salarySteps.length) {
      salarySteps.push({
        date: input.employee.hireDate,
        salary: input.employee.salary,
        eventId: 'current',
        label: 'Текущий оклад',
      });
    }
  }

  return { entries, salarySteps };
}
