import { describe, expect, it } from 'vitest';
import type { Department, Employee, Position } from '@/shared/types';
import { buildOrgTree } from './org';

const departments: Department[] = [
  { id: 'd1', name: 'ИТ-департамент', code: 'IT', parentId: null, headId: 'e1' },
  { id: 'd2', name: 'Отдел разработки', code: 'DEV', parentId: 'd1', headId: 'e2' },
  { id: 'd3', name: 'Группа бэкенда', code: 'BACK', parentId: 'd2', headId: null },
];

const positions: Position[] = [
  {
    id: 'p1',
    name: 'Директор',
    departmentId: 'd1',
    family: 'Руководство',
    grade: 4,
    salaryMin: 300000,
    salaryMax: 400000,
  },
  {
    id: 'p2',
    name: 'Тимлид',
    departmentId: 'd2',
    family: 'Руководство',
    grade: 4,
    salaryMin: 200000,
    salaryMax: 300000,
  },
  {
    id: 'p3',
    name: 'Разработчик',
    departmentId: 'd3',
    family: 'Backend',
    grade: 2,
    salaryMin: 130000,
    salaryMax: 240000,
  },
];

function employee(
  id: string,
  lastName: string,
  departmentId: string,
  positionId: string,
  status: Employee['status'] = 'active',
): Employee {
  return {
    id,
    personnelNumber: id,
    lastName,
    firstName: 'Тест',
    birthDate: '1990-01-01',
    gender: 'male',
    email: `${id}@hr.local`,
    phone: '+7 900 000-00-00',
    departmentId,
    positionId,
    hireDate: '2020-01-01',
    status,
    employmentType: 'full',
    salary: 150000,
  };
}

const employees = [
  employee('e1', 'Директоров', 'd1', 'p1'),
  employee('e2', 'Тимлидов', 'd2', 'p2'),
  employee('e3', 'Разработчиков', 'd3', 'p3'),
  employee('e4', 'Уволенный', 'd3', 'p3', 'dismissed'),
];

describe('buildOrgTree', () => {
  it('строит дерево и считает численность без уволенных', () => {
    const roots = buildOrgTree({ departments, employees, positions });

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('d1');
    expect(roots[0].totalCount).toBe(3);
    expect(roots[0].directCount).toBe(1);
    expect(roots[0].children[0].id).toBe('d2');
    expect(roots[0].children[0].totalCount).toBe(2);
    expect(roots[0].children[0].children[0].directCount).toBe(1);
    expect(roots[0].head?.name).toBe('Директоров Тест');
  });

  it('ограничивает дерево доступными подразделениями', () => {
    const roots = buildOrgTree({
      departments,
      employees,
      positions,
      allowedDepartmentIds: new Set(['d2', 'd3']),
    });

    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('d2');
    expect(roots[0].totalCount).toBe(2);
  });

  it('не зависает на цикле parentId', () => {
    const cyclic: Department[] = [
      { id: 'a', name: 'A', code: 'A', parentId: 'b' },
      { id: 'b', name: 'B', code: 'B', parentId: 'a' },
    ];
    const roots = buildOrgTree({
      departments: cyclic,
      employees: [],
      positions: [],
    });

    expect(roots).toHaveLength(1);
    expect(roots[0].totalCount).toBe(0);
  });
});
