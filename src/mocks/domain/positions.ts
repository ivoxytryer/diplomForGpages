import type { Position } from '@/shared/types';

/**
 * Должность должна существовать и относиться к выбранному подразделению.
 * Если у старой должности подразделение не заполнено, ограничение не применяется —
 * так же, как в прежней реализации API.
 */
export function positionDepartmentProblem(
  positions: Position[],
  departmentId: string,
  positionId: string,
): string | null {
  const position = positions.find((item) => item.id === positionId);
  if (!position) return 'Должность не найдена';
  if (position.departmentId && position.departmentId !== departmentId) {
    return 'Должность относится к другому подразделению';
  }
  return null;
}
