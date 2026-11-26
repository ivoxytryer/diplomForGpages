import { describe, expect, it } from 'vitest';
import type { Department, Employee, HrEvent, Position } from '@/shared/types';
import { buildEmployeeHistory } from './employee-history';

const employee: Employee = {
  id: 'e1',
  personnelNumber: '0001',
  lastName: 'Иванов',
  firstName: 'Пётр',
  birthDate: '1990-01-01',
  gender: 'male',
  email: 'p.ivanov@hr.local',
  phone: '+7 900 000-00-01',
  departmentId: 'd1',
  positionId: 'p2',
  hireDate: '2020-01-01',
  status: 'active',
  employmentType: 'full',
  salary: 150000,
};

const departments: Department[] = [
  { id: 'd1', name: 'ИТ-департамент', code: 'IT' },
  { id: 'd2', name: 'Отдел данных', code: 'DATA' },
];

const positions: Position[] = [
  { id: 'p1', name: 'Аналитик', departmentId: 'd1', family: 'Analytics', grade: 1, salaryMin: 80000, salaryMax: 120000 },
  { id: 'p2', name: 'Старший аналитик', departmentId: 'd1', family: 'Analytics', grade: 2, salaryMin: 120000, salaryMax: 160000 },
  { id: 'p3', name: 'Ведущий аналитик', departmentId: 'd2', family: 'Analytics', grade: 3, salaryMin: 150000, salaryMax: 220000 },
];

const events: HrEvent[] = [
  {
    id: 'ev1',
    employeeId: 'e1',
    type: 'hire',
    date: '2020-01-01',
    title: 'Приём на работу',
    fromDepartmentId: null,
    toDepartmentId: 'd1',
    fromPositionId: null,
    toPositionId: 'p1',
    newSalary: 90000,
    authorId: 'e9',
  },
  {
    id: 'ev2',
    employeeId: 'e1',
    type: 'promotion',
    date: '2023-06-01',
    title: 'Повышение',
    fromDepartmentId: 'd1',
    toDepartmentId: 'd1',
    fromPositionId: 'p1',
    toPositionId: 'p2',
    oldSalary: 90000,
    newSalary: 120000,
    authorId: 'e9',
  },
  {
    id: 'ev3',
    employeeId: 'e1',
    type: 'transfer',
    date: '2025-02-01',
    title: 'Перевод',
    fromDepartmentId: 'd1',
    toDepartmentId: 'd2',
    fromPositionId: 'p2',
    toPositionId: 'p3',
    oldSalary: 120000,
    newSalary: 150000,
    authorId: 'e9',
  },
];

const author: Employee = { ...employee, id: 'e9', lastName: 'Админов', firstName: 'Админ' };

describe('buildEmployeeHistory', () => {
  it('собирает записи от новых к старым и шаги оклада по возрастанию', () => {
    const history = buildEmployeeHistory({
      events,
      employee,
      departments,
      positions,
      employees: [employee, author],
      canViewSalary: true,
    });

    expect(history.entries.map((entry) => entry.id)).toEqual(['ev3', 'ev2', 'ev1']);
    expect(history.entries[0].departmentName).toBe('Отдел данных');
    expect(history.entries[0].positionName).toBe('Ведущий аналитик');
    expect(history.entries[0].grade).toBe(3);
    expect(history.entries[0].fromGrade).toBe(2);
    expect(history.entries[0].toGrade).toBe(3);
    expect(history.entries[0].authorName).toBe('Админов Админ');
    expect(history.salarySteps.map((step) => step.salary)).toEqual([90000, 120000, 150000]);
    expect(history.salarySteps.map((step) => step.grade)).toEqual([1, 2, 3]);
  });

  it('для изменения оклада без повышения показывает текущие должность и грейд', () => {
    const history = buildEmployeeHistory({
      events: [
        {
          id: 'ev4',
          employeeId: 'e1',
          type: 'salary_change',
          date: '2026-01-01',
          title: 'Изменение оклада',
          oldSalary: 150000,
          newSalary: 170000,
          authorId: 'e9',
        },
      ],
      employee,
      departments,
      positions,
      employees: [employee, author],
      canViewSalary: true,
    });

    expect(history.entries[0].positionName).toBe('Старший аналитик');
    expect(history.entries[0].grade).toBe(2);
    expect(history.salarySteps[0].grade).toBe(2);
  });

  it('для изменения оклада до повышения берёт грейд должности на тот момент', () => {
    const history = buildEmployeeHistory({
      events: [
        {
          id: 'ev1',
          employeeId: 'e1',
          type: 'hire',
          date: '2020-01-01',
          title: 'Приём',
          toPositionId: 'p1',
          toDepartmentId: 'd1',
          newSalary: 90000,
        },
        {
          id: 'ev2',
          employeeId: 'e1',
          type: 'salary_change',
          date: '2022-01-01',
          title: 'Изменение оклада',
          oldSalary: 90000,
          newSalary: 100000,
        },
        {
          id: 'ev3',
          employeeId: 'e1',
          type: 'promotion',
          date: '2023-01-01',
          title: 'Повышение',
          toPositionId: 'p2',
          toDepartmentId: 'd1',
          newSalary: 120000,
        },
      ],
      employee,
      departments,
      positions,
      employees: [employee],
      canViewSalary: true,
    });

    const salaryChange = history.entries.find((entry) => entry.type === 'salary_change');
    expect(salaryChange?.grade).toBe(1);
    expect(salaryChange?.positionName).toBe('Аналитик');
    expect(history.salarySteps.map((step) => step.grade)).toEqual([1, 1, 2]);
  });

  it('скрывает оклады, если нет права', () => {
    const history = buildEmployeeHistory({
      events,
      employee,
      departments,
      positions,
      employees: [employee, author],
      canViewSalary: false,
    });

    expect(history.salarySteps).toEqual([]);
    expect(history.entries.every((entry) => entry.newSalary === undefined)).toBe(true);
  });

  it('показывает текущий оклад, если событий с окладом нет', () => {
    const history = buildEmployeeHistory({
      events: [],
      employee,
      departments,
      positions,
      employees: [employee],
      canViewSalary: true,
    });

    expect(history.entries).toEqual([]);
    expect(history.salarySteps).toHaveLength(1);
    expect(history.salarySteps[0].salary).toBe(150000);
  });
});
