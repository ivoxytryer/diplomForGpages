import { pushAudit } from './audit';
import type { Db, Employee, User } from '@/shared/types';

/**
 * Кадровый жизненный цикл: восстановление, проверка блокеров увольнения
 * и мягкий архив. Никакого HTTP и localStorage — только данные и правила.
 */
export function restoreEmployee(db: Db, employee: Employee, actor: User) {
  employee.dismissalDate = null;
  const linkedUser = db.users.find((item) => item.employeeId === employee.id);
  if (linkedUser && !linkedUser.isActive) {
    linkedUser.isActive = true;
    pushAudit(
      db,
      actor,
      'Разблокирован доступ при восстановлении',
      'user',
      linkedUser.id,
      linkedUser.email,
    );
  }
}

export function dismissalBlocker(db: Db, employeeId: string) {
  const activeTasks = db.projectTasks.filter(
    (task) => task.employeeId === employeeId && task.status !== 'done',
  );
  if (activeTasks.length) {
    return 'Сначала переназначьте активные задачи сотрудника';
  }
  const managedProjects = db.projects.filter((project) => project.managerId === employeeId);
  if (managedProjects.length) {
    return 'Сначала назначьте нового руководителя проектов';
  }
  return null;
}

export function archiveEmployee(db: Db, employee: Employee, date: string, actor: User) {
  employee.status = 'dismissed';
  employee.dismissalDate = date;

  // Подчинённые и руководители подразделений не должны оставаться
  // за уволенным: поднимаем их на уровень выше.
  const fallbackManagerId =
    db.employees.find(
      (item) => item.id === employee.managerId && item.status !== 'dismissed',
    )?.id ?? null;
  db.employees.forEach((item) => {
    if (item.managerId === employee.id) item.managerId = fallbackManagerId;
  });
  db.departments = db.departments.map((department) =>
    department.headId === employee.id
      ? { ...department, headId: fallbackManagerId }
      : department,
  );

  // Незавершённые назначения больше не должны попадать в текущую загрузку.
  // Будущие назначения, которые ещё не начались, просто убираем.
  db.assignments = db.assignments.filter(
    (assignment) => !(assignment.employeeId === employee.id && assignment.startDate > date),
  );
  db.assignments.forEach((assignment) => {
    if (
      assignment.employeeId === employee.id &&
      (!assignment.endDate || assignment.endDate > date)
    ) {
      assignment.endDate = date;
    }
  });

  // Заявки, которые ещё не согласованы, после увольнения теряют смысл.
  db.absences.forEach((absence) => {
    if (absence.employeeId === employee.id && absence.status === 'pending') {
      absence.status = 'rejected';
      absence.approvedBy = null;
    }
  });

  const linkedUser = db.users.find(
    (item) => item.employeeId === employee.id && item.isActive,
  );
  if (linkedUser) {
    linkedUser.isActive = false;
    pushAudit(
      db,
      actor,
      'Заблокирован доступ при увольнении',
      'user',
      linkedUser.id,
      linkedUser.email,
    );
  }
}
