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

export function remainingCapacity(load: number, limit = LOAD_LIMIT) {
  return Math.max(0, limit - load);
}
