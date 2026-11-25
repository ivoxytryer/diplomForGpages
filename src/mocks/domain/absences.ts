import dayjs from 'dayjs';
import { nextId } from './ids';
import { absenceEventTitle, absenceEventType } from '@/shared/lib/meta';
import { formatDate, todayISO } from '@/shared/lib/utils';
import type { Absence, Db, Employee, EmployeeStatus, User } from '@/shared/types';

/** Согласованное отсутствие важнее старых ручных правок табеля. */
export function clearAbsenceOverrides(db: Db, absence: Absence) {
  for (const key of Object.keys(db.timesheetOverrides)) {
    if (!key.startsWith(`${absence.employeeId}|`)) continue;
    const list = db.timesheetOverrides[key] ?? [];
    const next = list.filter(
      (item) => item.date < absence.startDate || item.date > absence.endDate,
    );
    if (next.length === list.length) continue;
    if (next.length) db.timesheetOverrides[key] = next;
    else delete db.timesheetOverrides[key];
  }
}

/**
 * Статус сотрудника — производная от текущего согласованного отсутствия,
 * а не отдельное поле, которое кто-то должен не забыть обновить.
 * Вызывается и при записи, и при загрузке БД, поэтому «отпуск» не залипает
 * после окончания заявки.
 */
export function resolveEmployeeStatus(
  db: Db,
  employee: Employee,
  today = todayISO(),
): EmployeeStatus {
  if (employee.status === 'dismissed') return 'dismissed';

  const active = db.absences.find(
    (absence) =>
      absence.employeeId === employee.id &&
      absence.status === 'approved' &&
      absence.startDate <= today &&
      absence.endDate >= today,
  );
  if (active?.type === 'sick') return 'sick_leave';
  // Командировка — рабочие дни, статус сотрудника при этом не меняется.
  if (active && active.type !== 'business_trip') return 'vacation';

  if (employee.status === 'vacation' || employee.status === 'sick_leave') {
    return dayjs(employee.hireDate).add(3, 'month').isAfter(dayjs(today))
      ? 'probation'
      : 'active';
  }

  // Испытательный срок истёк — переводим в «Работает».
  if (
    employee.status === 'probation' &&
    !dayjs(employee.hireDate).add(3, 'month').isAfter(dayjs(today))
  ) {
    return 'active';
  }

  return employee.status;
}

export function syncEmployeeStatus(db: Db, employeeId: string) {
  const employee = db.employees.find((item) => item.id === employeeId);
  if (!employee || employee.status === 'dismissed') return;
  employee.status = resolveEmployeeStatus(db, employee);
}

export function syncAbsenceEvent(db: Db, absence: Absence, author: User | null) {
  const existing = db.events.find((event) => event.absenceId === absence.id);

  if (absence.status !== 'approved') {
    if (existing) db.events = db.events.filter((event) => event.absenceId !== absence.id);
    return;
  }

  const type = absenceEventType[absence.type];
  const title = absenceEventTitle[absence.type];
  if (!type || !title) return;

  const details = {
    type,
    date: absence.startDate,
    title,
    description: `Период: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}${
      absence.reason ? ` · ${absence.reason}` : ''
    }`,
  };

  if (existing) {
    Object.assign(existing, details);
    return;
  }

  db.events.push({
    id: nextId('ev', db.events),
    employeeId: absence.employeeId,
    ...details,
    absenceId: absence.id,
    authorId: author?.employeeId ?? null,
  });
}
