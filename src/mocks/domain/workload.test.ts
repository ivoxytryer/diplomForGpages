import { describe, expect, it } from 'vitest';
import type { Assignment, Db, Project } from '@/shared/types';
import { assignmentPeakLoad } from './workload';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'pr1',
    code: 'PRJ',
    name: 'Проект',
    status: 'active',
    startDate: '2026-01-01',
    endDate: null,
    color: '#000000',
    ...overrides,
  };
}

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'a1',
    projectId: 'pr1',
    employeeId: 'e1',
    projectRole: 'Разработчик',
    allocation: 60,
    startDate: '2026-03-01',
    endDate: null,
    ...overrides,
  };
}

function db(assignments: Assignment[], projects: Project[] = [project()]): Db {
  return { assignments, projects } as Db;
}

describe('assignmentPeakLoad', () => {
  it('видит перегруз, который наступит позже, а не только на дату старта', () => {
    const database = db([assignment()]);

    expect(assignmentPeakLoad(database, 'e1', '2026-01-01', '2026-02-28')).toBe(0);
    expect(assignmentPeakLoad(database, 'e1', '2026-01-01', '2026-03-31')).toBe(60);
  });

  it('учитывает пересечение с уже идущим назначением', () => {
    const database = db([assignment({ allocation: 50, startDate: '2026-01-01' })]);

    expect(assignmentPeakLoad(database, 'e1', '2026-02-01', null)).toBe(50);
  });

  it('исключает редактируемое назначение', () => {
    const database = db([assignment({ allocation: 80, startDate: '2026-01-01' })]);

    expect(assignmentPeakLoad(database, 'e1', '2026-02-01', null, 'a1')).toBe(0);
  });

  it('не учитывает назначения на завершённых проектах', () => {
    const database = db([assignment()], [project({ status: 'completed' })]);

    expect(assignmentPeakLoad(database, 'e1', '2026-01-01', null)).toBe(0);
  });
});
