import { describe, expect, it } from 'vitest';
import type {
  AbsenceType,
  ProjectTaskStatus,
  Role,
  TimesheetCode,
  TimesheetStatus,
} from '@/shared/types';
import {
  absenceTypeMeta,
  employmentTypeLabels,
  roleLabels,
  taskStatusMeta,
  timesheetCodeMeta,
  timesheetStatusMeta,
} from './meta';

describe('meta lookup fallbacks', () => {
  it('returns a neutral entry for an unknown task status', () => {
    expect(taskStatusMeta['in_progress' as ProjectTaskStatus]).toEqual({
      label: 'Неизвестно (in_progress)',
      tone: 'neutral',
    });
  });

  it('returns a neutral entry for an unknown timesheet status', () => {
    expect(timesheetStatusMeta['legacy' as TimesheetStatus].tone).toBe('neutral');
  });

  it('returns a neutral entry for an unknown timesheet code', () => {
    expect(timesheetCodeMeta['XX' as TimesheetCode]).toMatchObject({
      label: 'Код XX',
      short: 'XX',
      tone: 'neutral',
    });
  });

  it('gives an absence type fallback with a safe code', () => {
    expect(absenceTypeMeta['legacy' as AbsenceType]).toMatchObject({
      label: 'Неизвестный тип (legacy)',
      tone: 'neutral',
      code: '—',
    });
  });

  it('keeps metadata enumerable for select options', () => {
    expect(Object.keys(timesheetStatusMeta)).toEqual(['draft', 'submitted', 'approved']);
    expect(Object.keys(employmentTypeLabels)).toEqual(['full', 'part', 'contract']);
    expect(Object.keys(absenceTypeMeta)).toHaveLength(5);
  });

  it('returns a label for an unknown role', () => {
    expect(roleLabels['legacy' as Role]).toBe('Неизвестная роль (legacy)');
  });
});
