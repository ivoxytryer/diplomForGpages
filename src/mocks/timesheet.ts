import type {
  AbsenceType,
  Db,
  Employee,
  TimesheetCell,
  TimesheetCode,
  TimesheetResponse,
  TimesheetRow,
} from '@/shared/types';
import { datesOfMonth, isWeekend, normDaysOfMonth } from '@/shared/lib/utils';

const absenceCode: Record<AbsenceType, TimesheetCode> = {
  vacation: 'ОТ',
  sick: 'Б',
  business_trip: 'К',
  unpaid: 'Н',
  study: 'ОТ',
};

export function buildTimesheetRow(db: Db, employee: Employee, month: string): TimesheetRow {
  const dates = datesOfMonth(month);
  const overrides = db.timesheetOverrides[`${employee.id}|${month}`] ?? [];
  const overrideMap = new Map(overrides.map((item) => [item.date, item]));
  const absences = db.absences.filter(
    (absence) =>
      absence.employeeId === employee.id &&
      absence.status === 'approved' &&
      absence.startDate <= `${month}-31` &&
      absence.endDate >= `${month}-01`,
  );

  const days: TimesheetCell[] = dates.map((date) => {
    if (date < employee.hireDate || (employee.dismissalDate && date > employee.dismissalDate)) {
      return { date, code: '—', hours: 0, isOverride: false };
    }

    const override = overrideMap.get(date);
    if (override) {
      return {
        date,
        code: override.code,
        hours: override.hours,
        isOverride: true,
      };
    }

    if (isWeekend(date)) {
      return { date, code: 'В', hours: 0, isOverride: false };
    }

    const absence = absences.find((item) => item.startDate <= date && item.endDate >= date);
    if (absence) {
      const code = absenceCode[absence.type];
      return {
        date,
        code,
        // Командировка — рабочий день, остальные отсутствия не дают часов.
        hours: code === 'К' ? 8 : 0,
        isOverride: false,
        absenceId: absence.id,
      };
    }

    return { date, code: 'Я', hours: 8, isOverride: false };
  });

  const count = (codes: TimesheetCode[]) => days.filter((day) => codes.includes(day.code)).length;
  const workedDays = count(['Я']);
  const vacationDays = count(['ОТ']);
  const sickDays = count(['Б']);
  const tripDays = count(['К']);
  const absentDays = count(['П', 'Н']);
  const totalHours = days.reduce((sum, day) => sum + day.hours, 0);

  return {
    employeeId: employee.id,
    days,
    normDays: normDaysOfMonth(month),
    workedDays,
    vacationDays,
    sickDays,
    tripDays,
    absentDays,
    totalHours,
    status: db.timesheetStatuses[`${employee.id}|${month}`] ?? 'draft',
  };
}

export function buildTimesheet(
  db: Db,
  month: string,
  employees: Employee[],
  includeDismissed = false,
): TimesheetResponse {
  const active = includeDismissed
    ? employees
    : employees.filter((employee) => employee.status !== 'dismissed');
  return {
    month,
    normDays: normDaysOfMonth(month),
    rows: active.map((employee) => buildTimesheetRow(db, employee, month)),
  };
}

