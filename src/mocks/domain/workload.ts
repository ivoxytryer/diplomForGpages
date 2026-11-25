import { ADMIN_LOAD_LIMIT, calculateLoad } from '@/shared/lib/workload';
import type { Db, User } from '@/shared/types';

export function assignmentLoadAt(
  db: Db,
  employeeId: string,
  date: string,
  excludeAssignmentId?: string,
) {
  return calculateLoad(db.assignments, db.projects, employeeId, date, excludeAssignmentId);
}

/**
 * Максимальная загрузка сотрудника на всём периоде назначения.
 *
 * Загрузка меняется только в даты старта назначений (в даты окончания она
 * уменьшается), поэтому достаточно проверить старт нового периода и старты
 * всех пересекающихся назначений. Это ловит перегруз, который проявится
 * не сегодня, а через месяц.
 */
export function assignmentPeakLoad(
  db: Db,
  employeeId: string,
  startDate: string,
  endDate: string | null | undefined,
  excludeAssignmentId?: string,
) {
  const rangeEnd = endDate ?? '9999-12-31';
  const dates = new Set<string>([startDate]);

  db.assignments.forEach((assignment) => {
    if (assignment.employeeId !== employeeId) return;
    if (assignment.id === excludeAssignmentId) return;
    if (assignment.startDate > startDate && assignment.startDate <= rangeEnd) {
      dates.add(assignment.startDate);
    }
  });

  let peak = 0;
  dates.forEach((date) => {
    const load = assignmentLoadAt(db, employeeId, date, excludeAssignmentId);
    if (load > peak) peak = load;
  });
  return peak;
}

/**
 * projectedLoad должен быть максимумом загрузки за период назначения,
 * а не только на дату старта. Для FastAPI это отдельный расчёт по интервалам.
 */
export function validateOverload(
  actor: User,
  projectedLoad: number,
  reason: string | undefined,
) {
  if (projectedLoad <= 100) return null;
  if (actor.role !== 'admin') {
    return 'Превышение загрузки: итоговая загрузка сотрудника не может быть больше 100%';
  }
  if (projectedLoad > ADMIN_LOAD_LIMIT) {
    return `Администратор может разрешить перегруз только до ${ADMIN_LOAD_LIMIT}%`;
  }
  if (!reason?.trim()) {
    return 'Укажите причину перегруза — это действие доступно только администратору';
  }
  return null;
}
