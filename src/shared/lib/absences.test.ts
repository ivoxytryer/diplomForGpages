import { describe, expect, it } from 'vitest';
import type { Absence } from '@/shared/types';
import { findAbsenceOverlap, findEmployeeAbsenceNote, periodsOverlap } from './absences';

function absence(overrides: Partial<Absence>): Absence {
  return {
    id: 'ab1',
    employeeId: 'e004',
    type: 'vacation',
    startDate: '2026-11-16',
    endDate: '2026-11-18',
    days: 3,
    status: 'pending',
    createdAt: '2026-11-01T08:00:00.000Z',
    approvedBy: null,
    ...overrides,
  };
}

describe('absence overlap helpers', () => {
  it('detects inclusive overlaps', () => {
    expect(periodsOverlap('2026-11-10', '2026-11-12', '2026-11-12', '2026-11-14')).toBe(true);
    expect(periodsOverlap('2026-11-10', '2026-11-12', '2026-11-08', '2026-11-10')).toBe(true);
    expect(periodsOverlap('2026-11-10', '2026-11-12', '2026-11-09', '2026-11-13')).toBe(true);
  });

  it('does not treat adjacent periods as overlap', () => {
    expect(periodsOverlap('2026-11-10', '2026-11-12', '2026-11-13', '2026-11-15')).toBe(false);
    expect(periodsOverlap('2026-11-10', '2026-11-12', '2026-11-07', '2026-11-09')).toBe(false);
  });

  it('finds pending and approved absences but skips rejected', () => {
    const absences = [
      absence({ id: 'ab1', status: 'pending' }),
      absence({ id: 'ab2', status: 'approved', startDate: '2026-11-20', endDate: '2026-11-21' }),
      absence({ id: 'ab3', status: 'rejected', startDate: '2026-11-25', endDate: '2026-11-26' }),
    ];

    expect(
      findAbsenceOverlap(absences, {
        employeeId: 'e004',
        startDate: '2026-11-17',
        endDate: '2026-11-17',
      })?.id,
    ).toBe('ab1');
    expect(
      findAbsenceOverlap(absences, {
        employeeId: 'e004',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
      })?.id,
    ).toBe('ab2');
    expect(
      findAbsenceOverlap(absences, {
        employeeId: 'e004',
        startDate: '2026-11-25',
        endDate: '2026-11-25',
      }),
    ).toBeUndefined();
  });

  it('excludes the absence being edited and other employees', () => {
    const absences = [
      absence({ id: 'ab1', startDate: '2026-11-16', endDate: '2026-11-18' }),
      absence({ id: 'ab2', employeeId: 'e005', startDate: '2026-11-16', endDate: '2026-11-18' }),
    ];

    expect(
      findAbsenceOverlap(absences, {
        employeeId: 'e004',
        startDate: '2026-11-16',
        endDate: '2026-11-18',
        excludeId: 'ab1',
      }),
    ).toBeUndefined();
  });

  it('показывает текущее и ближайшее будущее отсутствие', () => {
    const absences = [
      absence({
        id: 'ab-active',
        status: 'approved',
        startDate: '2026-11-19',
        endDate: '2026-11-23',
      }),
      absence({
        id: 'ab-next',
        status: 'approved',
        startDate: '2026-12-01',
        endDate: '2026-12-05',
      }),
      absence({
        id: 'ab-rejected',
        status: 'rejected',
        startDate: '2026-11-21',
        endDate: '2026-11-22',
      }),
    ];

    const active = findEmployeeAbsenceNote(absences, 'e004', '2026-11-21');
    expect(active?.active).toBe(true);
    expect(active?.absence.id).toBe('ab-active');

    const upcoming = findEmployeeAbsenceNote(absences, 'e004', '2026-11-24');
    expect(upcoming?.active).toBe(false);
    expect(upcoming?.absence.id).toBe('ab-next');

    expect(findEmployeeAbsenceNote(absences, 'e004', '2026-11-01')?.absence.id).toBe('ab-active');
    expect(findEmployeeAbsenceNote(absences, 'e004', '2026-10-01')).toBeNull();
    expect(findEmployeeAbsenceNote(absences, 'e005', '2026-11-21')).toBeNull();
  });
});
