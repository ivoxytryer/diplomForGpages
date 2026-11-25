import { describe, expect, it } from 'vitest';
import {
  getCalendarDay,
  getDayHours,
  isCalendarYearSupported,
  isRedDay,
  isWorkingDay,
  nextWorkingDay,
  normDaysOfMonth,
  normHoursOfMonth,
  workingDaysBetween,
} from './calendar';

describe('производственный календарь 2026', () => {
  it('считает месячные нормы с праздниками и переносами', () => {
    expect(normDaysOfMonth('2026-01')).toBe(15);
    expect(normHoursOfMonth('2026-01')).toBe(120);
    expect(normDaysOfMonth('2026-05')).toBe(19);
    expect(normHoursOfMonth('2026-05')).toBe(151);
    expect(normDaysOfMonth('2026-11')).toBe(20);
    expect(normHoursOfMonth('2026-11')).toBe(159);
  });

  it('даёт годовую норму 247 дней и 1972 часа', () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      `2026-${String(index + 1).padStart(2, '0')}`,
    );
    expect(months.reduce((sum, month) => sum + normDaysOfMonth(month), 0)).toBe(247);
    expect(months.reduce((sum, month) => sum + normHoursOfMonth(month), 0)).toBe(1972);
  });

  it('помечает праздники и перенесённые выходные красным', () => {
    expect(isRedDay('2026-01-01')).toBe(true);
    expect(isRedDay('2026-01-09')).toBe(true);
    expect(isRedDay('2026-11-04')).toBe(true);
    expect(isRedDay('2026-11-03')).toBe(false);
    expect(getCalendarDay('2026-11-03').kind).toBe('shortened');
    expect(getDayHours('2026-11-03')).toBe(7);
  });

  it('не считает праздники рабочими', () => {
    expect(isWorkingDay('2026-01-05')).toBe(false);
    expect(isWorkingDay('2026-02-23')).toBe(false);
    expect(isWorkingDay('2026-05-09')).toBe(false);
    expect(isWorkingDay('2026-11-04')).toBe(false);
    expect(workingDaysBetween('2026-01-01', '2026-01-11')).toBe(0);
    expect(workingDaysBetween('2026-05-01', '2026-05-11')).toBe(5);
  });

  it('переносит задачи через праздники', () => {
    expect(nextWorkingDay('2026-04-30')).toBe('2026-05-04');
    expect(nextWorkingDay('2026-06-11')).toBe('2026-06-15');
    expect(nextWorkingDay('2026-11-03')).toBe('2026-11-05');
  });
});

describe('производственный календарь 2027', () => {
  it('считает месячные нормы с праздниками и переносами', () => {
    expect(normDaysOfMonth('2027-01')).toBe(15);
    expect(normHoursOfMonth('2027-01')).toBe(120);
    expect(normDaysOfMonth('2027-02')).toBe(19);
    expect(normHoursOfMonth('2027-02')).toBe(151);
    expect(normDaysOfMonth('2027-05')).toBe(19);
    expect(normHoursOfMonth('2027-05')).toBe(152);
  });

  it('даёт годовую норму 247 дней и 1972 часа', () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      `2027-${String(index + 1).padStart(2, '0')}`,
    );
    expect(months.reduce((sum, month) => sum + normDaysOfMonth(month), 0)).toBe(247);
    expect(months.reduce((sum, month) => sum + normHoursOfMonth(month), 0)).toBe(1972);
  });

  it('учитывает рабочую субботу 20 февраля и переносы', () => {
    expect(isWorkingDay('2027-02-20')).toBe(true);
    expect(getCalendarDay('2027-02-20').kind).toBe('working_saturday');
    expect(getDayHours('2027-02-20')).toBe(7);
    expect(nextWorkingDay('2027-02-19')).toBe('2027-02-20');
    expect(isRedDay('2027-02-22')).toBe(true);
    expect(isRedDay('2027-05-03')).toBe(true);
    expect(isRedDay('2027-05-10')).toBe(true);
    expect(isRedDay('2027-06-14')).toBe(true);
    expect(isRedDay('2027-11-05')).toBe(true);
    expect(isRedDay('2027-12-31')).toBe(true);
  });

  it('знает, на какие годы календарь настроен', () => {
    expect(isCalendarYearSupported(2026)).toBe(true);
    expect(isCalendarYearSupported(2027)).toBe(true);
    expect(isCalendarYearSupported(2028)).toBe(false);
  });
});
