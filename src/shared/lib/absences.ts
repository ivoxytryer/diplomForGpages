import dayjs from 'dayjs';
import type { Absence, AbsenceType } from '@/shared/types';
import { calendarDaysBetween, holidayDaysBetween, workingDaysBetween } from './calendar';

/** Пересечение периодов включительно: 10–12 и 12–14 пересекаются. */
export function periodsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

/**
 * Дни отсутствия зависят от типа:
 * - отпуск и отпуск без сохранения — календарные дни без нерабочих праздников;
 * - больничный — календарные дни;
 * - командировка и учёба — рабочие дни по производственному календарю.
 */
export function absenceDayBreakdown(type: AbsenceType, startDate: string, endDate: string) {
  const workingDays = workingDaysBetween(startDate, endDate);
  const calendarDays = calendarDaysBetween(startDate, endDate);
  const holidays = holidayDaysBetween(startDate, endDate);

  let days = workingDays;
  if (type === 'sick') days = calendarDays;
  else if (type === 'vacation' || type === 'unpaid') days = Math.max(0, calendarDays - holidays);

  return { days, workingDays, calendarDays };
}

/**
 * Ближайшее согласованное отсутствие сотрудника на дату:
 * сначала текущее, иначе ближайшее будущее в пределах 30 дней.
 */
export function findEmployeeAbsenceNote(
  absences: Absence[],
  employeeId: string,
  today: string,
): { absence: Absence; active: boolean } | null {
  const approved = absences.filter(
    (absence) => absence.employeeId === employeeId && absence.status === 'approved',
  );
  const current = approved
    .filter((absence) => absence.startDate <= today && absence.endDate >= today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  if (current) return { absence: current, active: true };

  const horizon = dayjs(today).add(30, 'day').format('YYYY-MM-DD');
  const upcoming = approved
    .filter((absence) => absence.startDate > today && absence.startDate <= horizon)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return upcoming ? { absence: upcoming, active: false } : null;
}

/**
 * Ищет существующее отсутствие, которое пересекается с указанным периодом.
 * По умолчанию учитываются только заявки «На согласовании» и «Согласовано»:
 * отклонённые периоды не занимают.
 */
export function findAbsenceOverlap(
  absences: Absence[],
  params: {
    employeeId: string;
    startDate: string;
    endDate: string;
    excludeId?: string;
    statuses?: Absence['status'][];
  },
) {
  const statuses = params.statuses ?? ['pending', 'approved'];
  return absences.find(
    (absence) =>
      absence.employeeId === params.employeeId &&
      absence.id !== params.excludeId &&
      statuses.includes(absence.status) &&
      periodsOverlap(params.startDate, params.endDate, absence.startDate, absence.endDate),
  );
}
