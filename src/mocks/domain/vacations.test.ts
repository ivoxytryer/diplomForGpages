import { describe, expect, it } from 'vitest';
import type { Absence, Db, VacationBalance } from '@/shared/types';
import { absenceDayBreakdown } from '@/shared/lib/absences';
import {
  vacationBalanceView,
  vacationDaysInYear,
  vacationLimitError,
} from './vacations';

function absence(overrides: Partial<Absence> = {}): Absence {
  return {
    id: 'ab1',
    employeeId: 'e1',
    type: 'vacation',
    startDate: '2026-12-20',
    endDate: '2027-01-10',
    days: 0,
    workingDays: 0,
    calendarDays: 0,
    status: 'approved',
    reason: 'Отпуск',
    createdAt: '2026-11-01T00:00:00.000Z',
    approvedBy: 'e2',
    ...overrides,
  };
}

function balance(year: number, entitlement = 28): VacationBalance {
  return {
    id: `vb-${year}`,
    employeeId: 'e1',
    year,
    entitlement,
    carryover: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function db(absences: Absence[] = [], balances: VacationBalance[] = []): Db {
  return { absences, vacationBalances: balances } as Db;
}

describe('vacationDaysInYear', () => {
  it('раскладывает отпуск на стыке лет по годам без потерь', () => {
    const period = { startDate: '2026-12-20', endDate: '2027-01-10' };
    const total = absenceDayBreakdown('vacation', period.startDate, period.endDate).days;

    expect(
      vacationDaysInYear(period, 2026) + vacationDaysInYear(period, 2027),
    ).toBe(total);
    expect(vacationDaysInYear(period, 2026)).toBeGreaterThan(0);
    expect(vacationDaysInYear(period, 2027)).toBeGreaterThan(0);
  });

  it('не считает дни вне периода', () => {
    expect(vacationDaysInYear({ startDate: '2026-05-01', endDate: '2026-05-10' }, 2027)).toBe(0);
  });
});

describe('vacationBalanceView', () => {
  it('учитывает одну заявку в балансах обоих годов', () => {
    const item = absence();
    const database = db([item], [balance(2026), balance(2027)]);

    const first = vacationBalanceView(database, 'e1', 2026);
    const second = vacationBalanceView(database, 'e1', 2027);

    expect(first.planned).toBe(vacationDaysInYear(item, 2026));
    expect(second.planned).toBe(vacationDaysInYear(item, 2027));
    expect(first.planned + second.planned).toBe(
      absenceDayBreakdown('vacation', item.startDate, item.endDate).days,
    );
  });
});

describe('vacationLimitError', () => {
  it('проверяет остаток каждого года, который пересекает отпуск', () => {
    const database = db([], [balance(2026, 1), balance(2027, 28)]);

    const error = vacationLimitError(
      database,
      'e1',
      'vacation',
      '2026-12-20',
      '2027-01-10',
    );

    expect(error).toContain('2026');
    expect(error).toContain('Недостаточно дней отпуска');
  });

  it('разрешает отпуск, если дней хватает в обоих годах', () => {
    const database = db([], [balance(2026, 28), balance(2027, 28)]);

    expect(
      vacationLimitError(database, 'e1', 'vacation', '2026-12-20', '2027-01-10'),
    ).toBeNull();
  });
});
