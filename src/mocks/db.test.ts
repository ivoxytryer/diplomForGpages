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

  it('normalizes stale employee, project and payroll statuses', () => {
    const db = createSeed();
    db.employees[0].status = 'legacy' as (typeof db.employees)[number]['status'];
    db.employees[0].gender = 'legacy' as (typeof db.employees)[number]['gender'];
    db.employees[0].employmentType = 'legacy' as (typeof db.employees)[number]['employmentType'];
    db.projects[0].status = 'legacy' as (typeof db.projects)[number]['status'];
    db.payslips.push({
      id: 'pay-test',
      period: '2026-11',
      employeeId: db.employees[0].id,
      baseSalary: 0,
      normDays: 0,
      paidDays: 0,
      workedDays: 0,
      bonus: 0,
      gross: 0,
      ndfl: 0,
      net: 0,
      status: 'legacy' as (typeof db.payslips)[number]['status'],
      createdAt: new Date().toISOString(),
    });
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.employees[0].status).toBe('active');
    expect(loaded.employees[0].gender).toBe('male');
    expect(loaded.employees[0].employmentType).toBe('full');
    expect(loaded.projects[0].status).toBe('planning');
    expect(loaded.payslips[0].status).toBe('draft');
  });

  it('drops absences with unknown types', () => {
    const db = createSeed();
    const before = db.absences.length;
    db.absences[0].type = 'legacy' as AbsenceType;
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.absences).toHaveLength(before - 1);
  });

  it('keeps an intentionally empty employee list instead of reseeding', () => {
    const db = createSeed();
    db.employees = [];
    saveDb(db);

    const loaded = loadDb();

    expect(loaded.employees).toEqual([]);
  });
});
