import type { Assignment, Project } from '@/shared/types';

const LOAD_LIMIT = 100;
export const ADMIN_LOAD_LIMIT = 150;

export type ProjectLookup = Project[] | Map<string, Project>;

function projectOf(projects: ProjectLookup, projectId: string) {
  return Array.isArray(projects)
    ? projects.find((project) => project.id === projectId)
    : projects.get(projectId);
}

/**
 * Назначение считается активным, если оно уже началось, ещё не закончилось,
 * а проект не завершён. Будущие и закрытые назначения в «текущую загрузку»
 * не попадают.
 */
export function isAssignmentActive(
  assignment: Assignment,
  project: Project | undefined,
  date: string,
) {
  if (!project || project.status === 'completed') return false;
  if (assignment.startDate > date) return false;
  if (assignment.endDate && assignment.endDate < date) return false;
  return true;
}

export function isAssignmentActiveOn(
  assignment: Assignment,
  projects: ProjectLookup,
  date: string,
) {
  return isAssignmentActive(assignment, projectOf(projects, assignment.projectId), date);
}

/**
 * Суммарная активная загрузка сотрудника на дату.
 * При редактировании назначения передайте excludeAssignmentId, чтобы
 * не учитывать старое значение дважды.
 */
export function calculateLoad(
  assignments: Assignment[],
  projects: ProjectLookup,
  employeeId: string,
  date: string,
  excludeAssignmentId?: string,
) {
  return assignments
    .filter(
      (assignment) =>
        assignment.employeeId === employeeId &&
        assignment.id !== excludeAssignmentId &&
        isAssignmentActiveOn(assignment, projects, date),
    )
    .reduce((sum, assignment) => sum + assignment.allocation, 0);
}

/**
 * Пик активной загрузки сотрудника за период назначения.
 * Проверяются дата старта и все пересекающиеся старты других назначений —
 * так же, как на сервере. Иначе форма пропустит перегруз, который появится
 * позже, когда начнётся другое назначение.
 */
export function calculatePeakLoad(
  assignments: Assignment[],
  projects: ProjectLookup,
  employeeId: string,
  startDate: string,
  endDate: string | null | undefined,
  excludeAssignmentId?: string,
) {
  const rangeEnd = endDate ?? '9999-12-31';
  const dates = new Set<string>([startDate]);

  assignments.forEach((assignment) => {
    if (assignment.employeeId !== employeeId) return;
    if (assignment.id === excludeAssignmentId) return;
    if (assignment.startDate > startDate && assignment.startDate <= rangeEnd) {
      dates.add(assignment.startDate);
    }
  });

  let peak = 0;
  dates.forEach((date) => {
    const load = calculateLoad(assignments, projects, employeeId, date, excludeAssignmentId);
    if (load > peak) peak = load;
  });
  return peak;
}

export function remainingCapacity(load: number, limit = LOAD_LIMIT) {
  return Math.max(0, limit - load);
}
