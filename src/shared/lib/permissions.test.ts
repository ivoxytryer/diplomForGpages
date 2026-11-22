import { describe, expect, it } from 'vitest';
import type { Role } from '@/shared/types';
import { can, canViewSalary } from './permissions';

describe('can', () => {
  it('allows a known role with the action', () => {
    expect(can('admin', 'employees:read')).toBe(true);
  });

  it('denies an unknown role instead of throwing', () => {
    expect(can('legacy' as Role, 'employees:read')).toBe(false);
  });

  it('keeps destructive and payroll actions away from HR', () => {
    expect(can('hr', 'employees:write')).toBe(true);
    expect(can('hr', 'employees:delete')).toBe(false);
    expect(can('hr', 'employees:dismiss')).toBe(false);
    expect(can('hr', 'timesheet:edit')).toBe(true);
    expect(can('hr', 'timesheet:approve')).toBe(true);
    expect(can('hr', 'payroll:read')).toBe(true);
    expect(can('hr', 'payroll:write')).toBe(false);
    expect(can('hr', 'salary:read')).toBe(true);
    expect(can('hr', 'salary:write')).toBe(false);
    expect(can('manager', 'salary:read')).toBe(true);
    expect(can('manager', 'timesheet:edit')).toBe(false);
    expect(can('manager', 'timesheet:approve')).toBe(true);
    expect(can('manager', 'projects:manage-manager')).toBe(true);
    expect(can('admin', 'salary:write')).toBe(true);
  });

  it('показывает чужой оклад только admin и HR', () => {
    expect(canViewSalary({ role: 'admin' }, 'e004')).toBe(true);
    expect(canViewSalary({ role: 'hr' }, 'e004')).toBe(true);
    expect(canViewSalary({ role: 'manager', employeeId: 'e003' }, 'e004')).toBe(false);
    expect(canViewSalary({ role: 'manager', employeeId: 'e003' }, 'e003')).toBe(true);
    expect(canViewSalary({ role: 'employee', employeeId: 'e004' }, 'e004')).toBe(true);
    expect(canViewSalary(null, 'e004')).toBe(false);
  });
});
