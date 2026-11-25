import { absenceDayBreakdown } from '@/shared/lib/absences';
import { todayISO } from '@/shared/lib/utils';
import type { Absence, Db, VacationBalanceView } from '@/shared/types';

/** Сколько дней отпуска из периода приходится на конкретный календарный год. */
export function vacationDaysInYear(
  period: Pick<Absence, 'startDate' | 'endDate'>,
  year: number,
) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (period.endDate < yearStart || period.startDate > yearEnd) return 0;

  const startDate = period.startDate > yearStart ? period.startDate : yearStart;
  const endDate = period.endDate < yearEnd ? period.endDate : yearEnd;
  return absenceDayBreakdown('vacation', startDate, endDate).days;
}

export function vacationBalanceView(
  db: Db,
  employeeId: string,
  year: number,
  excludeAbsenceId?: string,
): VacationBalanceView {

  const balance =
    db.vacationBalances.find(
      (item) => item.employeeId === employeeId && item.year === year,
    ) ??
    ({
      id: `default-${employeeId}-${year}`,
      employeeId,
      year,
      entitlement: 28,
      carryover: 0,
      updatedAt: new Date().toISOString(),
    });

  const today = todayISO();
  // Отпуск на стыке лет раскладывается по годам: заявка попадает в баланс
  // каждого года, который она пересекает.
  const vacations = db.absences.filter(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.type === 'vacation' &&
      absence.id !== excludeAbsenceId &&
      absence.status !== 'rejected' &&
      absence.startDate <= `${year}-12-31` &&
      absence.endDate >= `${year}-01-01`,
  );
  const daysInYear = (absence: Absence) => vacationDaysInYear(absence, year);
  const used = vacations
    .filter((absence) => absence.status === 'approved' && absence.startDate <= today)
    .reduce((sum, absence) => sum + daysInYear(absence), 0);
  const planned = vacations
    .filter(
      (absence) =>
        absence.status === 'pending' ||
        (absence.status === 'approved' && absence.startDate > today),
    )
    .reduce((sum, absence) => sum + daysInYear(absence), 0);

  return {
    ...balance,
    used,
    planned,
    remaining: balance.entitlement + balance.carryover - used - planned,
  };
}

export function vacationLimitError(
  db: Db,
  employeeId: string,
  type: Absence['type'],
  startDate: string,
  endDate: string,
  excludeAbsenceId?: string,
) {
  if (type !== 'vacation') return null;

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;

  for (let year = startYear; year <= endYear; year += 1) {
    const days = vacationDaysInYear({ startDate, endDate }, year);
    if (days === 0) continue;
    const balance = vacationBalanceView(db, employeeId, year, excludeAbsenceId);
    if (days > balance.remaining) {
      return `Недостаточно дней отпуска в ${year} году: остаток ${balance.remaining}, запрошено ${days}`;
    }
  }
  return null;
}
