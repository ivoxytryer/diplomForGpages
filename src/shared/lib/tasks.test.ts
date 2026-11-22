import { describe, expect, it } from 'vitest';
import type { ProjectTask } from '@/shared/types';
import {
  isTaskDueToday,
  isTaskOverdue,
  nextWorkingDay,
  postponeTaskDate,
  sortTasks,
} from './tasks';

function task(overrides: Partial<ProjectTask>): ProjectTask {
  return {
    id: 't1',
    projectId: 'pr1',
    employeeId: 'e004',
    title: 'Задача',
    dueDate: '2026-11-06',
    status: 'todo',
    createdById: 'u1',
    createdByName: 'Павел Соколов',
    createdAt: '2026-11-01T08:00:00.000Z',
    completedAt: null,
    originalDueDate: '2026-11-06',
    carryCount: 0,
    carryHistory: [],
    ...overrides,
  };
}

describe('task date helpers', () => {
  it('moves to the next working day from a weekday', () => {
    // 06.11.2026 — пятница.
    expect(nextWorkingDay('2026-11-05')).toBe('2026-11-06');
    // 09.11.2026 — понедельник.
    expect(nextWorkingDay('2026-11-06')).toBe('2026-11-09');
    expect(nextWorkingDay('2026-11-09')).toBe('2026-11-10');
  });

  it('skips weekends', () => {
    // 07.11.2026 — суббота, 08.11.2026 — воскресенье.
    expect(nextWorkingDay('2026-11-07')).toBe('2026-11-09');
    expect(nextWorkingDay('2026-11-08')).toBe('2026-11-09');
    expect(nextWorkingDay('2026-11-09')).toBe('2026-11-10');
  });

  it('counts an overdue task from today, not from the past date', () => {
    expect(postponeTaskDate('2026-11-01', '2026-11-06')).toBe('2026-11-09');
    expect(postponeTaskDate('2026-11-08', '2026-11-08')).toBe('2026-11-09');
  });

  it('moves a future task one working day forward', () => {
    expect(postponeTaskDate('2026-11-10', '2026-11-06')).toBe('2026-11-11');
  });

  it('detects overdue and due-today tasks', () => {
    const today = '2026-11-08';
    expect(isTaskOverdue(task({ dueDate: '2026-11-07' }), today)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: '2026-11-08' }), today)).toBe(false);
    expect(isTaskOverdue(task({ dueDate: '2026-11-07', status: 'done' }), today)).toBe(false);
    expect(isTaskDueToday(task({ dueDate: '2026-11-08' }), today)).toBe(true);
    expect(isTaskDueToday(task({ dueDate: '2026-11-08', status: 'done' }), today)).toBe(false);
  });

  it('sorts open tasks by date before completed ones', () => {
    const sorted = sortTasks([
      task({ id: 'done', status: 'done', dueDate: '2026-11-01' }),
      task({ id: 'later', dueDate: '2026-11-10' }),
      task({ id: 'soon', dueDate: '2026-11-08' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['soon', 'later', 'done']);
  });
});
