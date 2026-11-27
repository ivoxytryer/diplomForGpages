import { ADMIN_LOAD_LIMIT, calculateLoad, calculatePeakLoad } from '@/shared/lib/workload';
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
 * Расчёт общий с фронтендом — см. `calculatePeakLoad`.
 */
export function assignmentPeakLoad(
  db: Db,
  employeeId: string,
  startDate: string,
  endDate: string | null | undefined,
  excludeAssignmentId?: string,
) {
  return calculatePeakLoad(
    db.assignments,
    db.projects,
    employeeId,
    startDate,
    endDate,
    excludeAssignmentId,
  );
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
