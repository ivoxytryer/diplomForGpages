import { describe, expect, it } from 'vitest';
import type { Employee } from '@/shared/types';
import { createSeed } from './data';
import { buildTimesheetRow } from './timesheet';

function setup(hireDate: string) {
  const db = createSeed();
  db.absences = [];
  db.timesheetOverrides = {};
  db.timesheetStatuses = {};
  const base = db.employees.find((item) => item.id === 'e004');
  if (!base) throw new Error('В сиде нет сотрудника e004');
  const employee: Employee = { ...base, hireDate };
  return { db, employee };
}

describe('buildTimesheetRow: явки только с даты приёма', () => {
  it('не ставит Я до даты приёма и считает дни с приёма', () => {
    // 16.11.2026 — понедельник.
    const { db, employee } = setup('2026-11-16');
    const row = buildTimesheetRow(db, employee, '2026-11');

    const before = row.days.filter((day) => day.date < '2026-11-16');
    expect(before.length).toBe(15);
    expect(before.every((day) => day.code === '—' && day.hours === 0)).toBe(true);

    const firstDay = row.days.find((day) => day.date === '2026-11-16');
    expect(firstDay?.code).toBe('Я');
    expect(firstDay?.hours).toBe(8);

    // Суббота после приёма остаётся выходным.
    expect(row.days.find((day) => day.date === '2026-11-21')?.code).toBe('В');

    // Будни с 16 по 30 ноября: 16–20, 23–27, 30 = 11 дней.
    expect(row.workedDays).toBe(11);
    expect(row.totalHours).toBe(88);
  });

  it('работает при приёме в начале месяца', () => {
    // 02.11.2026 — понедельник, 01.11 — воскресенье до приёма.
    const { db, employee } = setup('2026-11-02');
    const row = buildTimesheetRow(db, employee, '2026-11');

    expect(row.days.find((day) => day.date === '2026-11-01')?.code).toBe('—');
    expect(row.days.find((day) => day.date === '2026-11-02')?.code).toBe('Я');
    expect(row.days.some((day) => day.code === '—')).toBe(true);
    // Ноябрь 2026: 20 рабочих дней, 4 ноября — праздник, 3 ноября — сокращённый день.
    expect(row.workedDays).toBe(20);
    expect(row.totalHours).toBe(159);
  });

  it('не начисляет явки после даты увольнения', () => {
    const { db, employee } = setup('2026-11-02');
    const dismissed: Employee = { ...employee, dismissalDate: '2026-11-10' };
    const row = buildTimesheetRow(db, dismissed, '2026-11');

    expect(row.days.find((day) => day.date === '2026-11-10')?.code).toBe('Я');
    expect(row.days.find((day) => day.date === '2026-11-11')?.code).toBe('—');
    expect(row.days.find((day) => day.date === '2026-11-30')?.code).toBe('—');
    // 2, 3, 5, 6, 9 и 10 ноября; 3 ноября сокращён на час, 4 ноября — праздник.
    expect(row.workedDays).toBe(6);
    expect(row.totalHours).toBe(47);
  });

  it('начисляет 8 часов за рабочие дни командировки', () => {
    const { db, employee } = setup('2026-11-02');
    db.absences = [
      {
        id: 'ab-trip',
        employeeId: employee.id,
        type: 'business_trip',
        startDate: '2026-11-10',
        endDate: '2026-11-11',
        days: 2,
        status: 'approved',
        createdAt: '2026-11-01T00:00:00.000Z',
        approvedBy: 'e002',
      },
    ];

    const row = buildTimesheetRow(db, employee, '2026-11');

    expect(row.tripDays).toBe(2);
    expect(row.days.find((day) => day.date === '2026-11-10')?.hours).toBe(8);
    // 20 рабочих дней месяца, два из них — командировка.
    expect(row.workedDays).toBe(18);
    expect(row.totalHours).toBe(159);
  });

  it('подставляет коды согласованных отсутствий и игнорирует несогласованные', () => {
    const { db, employee } = setup('2026-11-02');
    const base = {
      employeeId: employee.id,
      days: 1,
      createdAt: '2026-11-01T00:00:00.000Z',
      approvedBy: 'e002',
    };
    db.absences = [
      { ...base, id: 'ab-vac', type: 'vacation', startDate: '2026-11-03', endDate: '2026-11-03', status: 'approved' },
      { ...base, id: 'ab-sick', type: 'sick', startDate: '2026-11-05', endDate: '2026-11-05', status: 'approved' },
      { ...base, id: 'ab-trip', type: 'business_trip', startDate: '2026-11-06', endDate: '2026-11-06', status: 'approved' },
      { ...base, id: 'ab-unpaid', type: 'unpaid', startDate: '2026-11-09', endDate: '2026-11-09', status: 'approved' },
      { ...base, id: 'ab-study', type: 'study', startDate: '2026-11-10', endDate: '2026-11-10', status: 'approved' },
      { ...base, id: 'ab-pending', type: 'vacation', startDate: '2026-11-11', endDate: '2026-11-11', status: 'pending' },
    ];

    const row = buildTimesheetRow(db, employee, '2026-11');
    const code = (date: string) => row.days.find((day) => day.date === date);

    expect(code('2026-11-03')?.code).toBe('ОТ');
    expect(code('2026-11-03')?.hours).toBe(0);
    // 4 ноября — праздник, отсутствие на праздничный день не накладывается.
    expect(code('2026-11-04')?.code).toBe('В');
    expect(code('2026-11-05')?.code).toBe('Б');
    expect(code('2026-11-05')?.hours).toBe(0);
    expect(code('2026-11-06')?.code).toBe('К');
    expect(code('2026-11-06')?.hours).toBe(8);
    expect(code('2026-11-09')?.code).toBe('Н');
    expect(code('2026-11-09')?.hours).toBe(0);
    expect(code('2026-11-10')?.code).toBe('ОТ');
    expect(code('2026-11-11')?.code).toBe('Я');
    expect(row.vacationDays).toBe(2);
    expect(row.sickDays).toBe(1);
    expect(row.tripDays).toBe(1);
    expect(row.absentDays).toBe(1);
  });

  it('игнорирует ручную отметку до даты приёма', () => {
    const { db, employee } = setup('2026-11-16');
    db.timesheetOverrides[`${employee.id}|2026-11`] = [
      { date: '2026-11-05', code: 'Я', hours: 8 },
    ];

    const row = buildTimesheetRow(db, employee, '2026-11');
    const day = row.days.find((item) => item.date === '2026-11-05');
    expect(day?.code).toBe('—');
    expect(day?.hours).toBe(0);
    expect(day?.isOverride).toBe(false);
  });
});
