import { describe, expect, it } from 'vitest';
import type { Assignment, Project } from '@/shared/types';
import { calculateLoad, calculatePeakLoad, isAssignmentActive, remainingCapacity } from './workload';

const projects: Project[] = [
  {
    id: 'pr1',
    code: 'A',
    name: 'Активный',
    status: 'active',
    startDate: '2026-01-01',
    endDate: null,
    color: '#000',
  },
  {
    id: 'pr2',
    code: 'B',
    name: 'Завершённый',
    status: 'completed',
    startDate: '2026-01-01',
    endDate: '2026-06-01',
    color: '#000',
  },
];

function assignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: 'a1',
    projectId: 'pr1',
    employeeId: 'e1',
    projectRole: 'Участник',
    allocation: 50,
    startDate: '2026-01-01',
    endDate: null,
    ...overrides,
  };
}

describe('активная загрузка', () => {
  it('не учитывает завершённые, будущие и закрытые назначения', () => {
    const list = [
      assignment({ id: 'active', allocation: 40 }),
      assignment({ id: 'future', allocation: 50, startDate: '2026-12-01' }),
      assignment({ id: 'ended', allocation: 30, endDate: '2026-10-31' }),
      assignment({ id: 'completed-project', projectId: 'pr2', allocation: 60 }),
    ];
    expect(calculateLoad(list, projects, 'e1', '2026-11-24')).toBe(40);
  });

  it('исключает редактируемое назначение из старой загрузки', () => {
    const list = [assignment({ id: 'a1', allocation: 50 }), assignment({ id: 'a2', allocation: 30 })];
    expect(calculateLoad(list, projects, 'e1', '2026-11-24')).toBe(80);
    expect(calculateLoad(list, projects, 'e1', '2026-11-24', 'a1')).toBe(30);
  });

  it('считает остаток и активность по датам', () => {
    expect(remainingCapacity(90)).toBe(10);
    expect(remainingCapacity(100)).toBe(0);
    expect(isAssignmentActive(assignment({}), projects[0], '2026-11-24')).toBe(true);
    expect(isAssignmentActive(assignment({ endDate: '2026-11-01' }), projects[0], '2026-11-24')).toBe(false);
    expect(isAssignmentActive(assignment({}), projects[1], '2026-11-24')).toBe(false);
  });
});

describe('пик загрузки за период', () => {
  const list = [
    assignment({ id: 'now', allocation: 40 }),
    assignment({ id: 'future', allocation: 30, startDate: '2026-12-01' }),
  ];

  it('учитывает будущие пересекающиеся назначения', () => {
    expect(calculatePeakLoad(list, projects, 'e1', '2026-11-24', null)).toBe(70);
    expect(calculatePeakLoad(list, projects, 'e1', '2026-12-15', null)).toBe(70);
  });

  it('не учитывает будущий старт за пределами периода', () => {
    expect(calculatePeakLoad(list, projects, 'e1', '2026-11-24', '2026-11-30')).toBe(40);
  });

  it('исключает редактируемое назначение', () => {
    expect(calculatePeakLoad(list, projects, 'e1', '2026-11-24', null, 'now')).toBe(30);
  });
});
