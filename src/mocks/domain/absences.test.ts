import { describe, expect, it } from 'vitest';
import type { Absence, Db, Employee } from '@/shared/types';
import { resolveEmployeeStatus } from './absences';

const today = '2026-11-25';

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    personnelNumber: '0001',
    lastName: 'Иванов',
    firstName: 'Пётр',
    birthDate: '1990-01-01',
    gender: 'male',
    email: 'p.ivanov@hr.local',
    phone: '+7 900 000-00-01',
    departmentId: 'd1',
    positionId: 'p1',
    hireDate: '2020-01-01',
    status: 'active',
    employmentType: 'full',
    salary: 120_000,
    ...overrides,
  };
}

function absence(overrides: Partial<Absence> = {}): Absence {
  return {
    id: 'ab1',
    employeeId: 'e1',
    type: 'vacation',
    startDate: '2026-11-20',
    endDate: '2026-11-30',
    days: 11,
    workingDays: 8,
    calendarDays: 11,
    status: 'approved',
    reason: 'Отпуск',
    createdAt: '2026-11-01T00:00:00.000Z',
    approvedBy: 'e2',
    ...overrides,
  };
}

function db(absences: Absence[]): Db {
  return { absences } as Db;
}

describe('resolveEmployeeStatus', () => {
  it('ставит «В отпуске», пока согласованный отпуск идёт', () => {
    expect(resolveEmployeeStatus(db([absence()]), employee(), today)).toBe('vacation');
  });

  it('возвращает «Работает» после окончания отпуска', () => {
    const past = absence({ startDate: '2026-10-01', endDate: '2026-10-14' });
    expect(
      resolveEmployeeStatus(db([past]), employee({ status: 'vacation' }), today),
    ).toBe('active');
  });

  it('не включает отпуск, который ещё не начался', () => {
    const future = absence({ startDate: '2026-12-01', endDate: '2026-12-14' });
    expect(resolveEmployeeStatus(db([future]), employee(), today)).toBe('active');
  });

  it('ставит «На больничном» для подтверждённого больничного', () => {
    const sick = absence({ type: 'sick', startDate: '2026-11-24', endDate: '2026-11-27' });
    expect(resolveEmployeeStatus(db([sick]), employee(), today)).toBe('sick_leave');
  });

  it('не оставляет «В отпуске» из-за командировки', () => {
    const trip = absence({
      type: 'business_trip',
      startDate: '2026-11-24',
      endDate: '2026-11-26',
    });
    expect(
      resolveEmployeeStatus(db([trip]), employee({ status: 'vacation' }), today),
    ).toBe('active');
  });

  it('переводит истёкший испытательный срок в «Работает»', () => {
    const hired = employee({ status: 'probation', hireDate: '2026-01-10' });
    expect(resolveEmployeeStatus(db([]), hired, today)).toBe('active');
  });

  it('оставляет испытательный срок, если он ещё идёт', () => {
    const hired = employee({ status: 'probation', hireDate: '2026-10-01' });
    expect(resolveEmployeeStatus(db([]), hired, today)).toBe('probation');
  });

  it('не трогает уволенного сотрудника', () => {
    const dismissed = employee({ status: 'dismissed' });
    expect(resolveEmployeeStatus(db([absence()]), dismissed, today)).toBe('dismissed');
  });
});
