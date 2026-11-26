import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AbsenceType,
  ProjectTaskStatus,
  TimesheetCode,
  TimesheetStatus,
} from '@/shared/types';
import { createSeed } from './data';
import { loadDb, saveDb } from './db';
import { MemoryStorage } from '@/test/memory-storage';

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
});

describe('localStorage migration', () => {
  it('normalizes task and timesheet values from older schemas', () => {
    const db = createSeed();
    const employee = db.employees[0];
    const month = '2026-11';
    const key = `${employee.id}|${month}`;

    db.projectTasks[0].status = 'in_progress' as ProjectTaskStatus;
    db.timesheetStatuses[key] = 'legacy' as TimesheetStatus;
    db.timesheetOverrides[key] = [{ date: `${month}-03`, code: 'XX' as TimesheetCode, hours: 8 }];
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.projectTasks[0].status).toBe('todo');
    expect(loaded.timesheetStatuses[key]).toBe('draft');
    expect(loaded.timesheetOverrides[key]).toEqual([]);
  });

  it('normalizes stale employee and project statuses', () => {
    const db = createSeed();
    db.employees[0].status = 'legacy' as (typeof db.employees)[number]['status'];
    db.employees[0].gender = 'legacy' as (typeof db.employees)[number]['gender'];
    db.employees[0].employmentType = 'legacy' as (typeof db.employees)[number]['employmentType'];
    db.projects[0].status = 'legacy' as (typeof db.projects)[number]['status'];
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.employees[0].status).toBe('active');
    expect(loaded.employees[0].gender).toBe('male');
    expect(loaded.employees[0].employmentType).toBe('full');
    expect(loaded.projects[0].status).toBe('planning');
  });

  it('drops absences with unknown types', () => {
    const db = createSeed();
    const before = db.absences.length;
    db.absences[0].type = 'legacy' as AbsenceType;
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.absences).toHaveLength(before - 1);
  });

  it('исправляет автора изменения оклада в старых демо-данных', () => {
    const db = createSeed();
    const salaryEvent = db.events.find((event) => event.type === 'salary_change');
    expect(salaryEvent).toBeTruthy();
    salaryEvent!.authorId = 'e002';
    saveDb(db);

    const loaded = loadDb();
    const admin = loaded.users.find((user) => user.role === 'admin');
    expect(loaded.events.find((event) => event.id === salaryEvent!.id)?.authorId).toBe(
      admin?.employeeId,
    );
  });

  it('автоматически завершает истёкший испытательный срок', () => {
    const db = createSeed();
    db.employees[0].status = 'probation';
    db.employees[0].hireDate = '2020-01-01';
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.employees[0].status).toBe('active');
  });

  it('keeps an intentionally empty employee list instead of reseeding', () => {
    const db = createSeed();
    db.employees = [];
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.employees).toEqual([]);
  });
});
