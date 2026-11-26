import type { Department } from '@/shared/types';

/**
 * Зона, где руководитель принимает кадровые решения: своё подразделение,
 * все дочерние и подразделения, где он указан руководителем (`headId`).
 *
 * Шире этой зоны руководитель только смотрит: команды своих проектов видны
 * в списках, табеле и отсутствиях, но согласуют их руководитель подразделения
 * или HR.
 */
export function managerZoneDepartmentIds(
  departments: Department[],
  ownDepartmentId: string | null | undefined,
  managerEmployeeId: string | null | undefined,
) {
  const result = new Set<string>();
  if (!managerEmployeeId) return result;

  const roots = new Set<string>();
  if (ownDepartmentId) roots.add(ownDepartmentId);
  departments.forEach((department) => {
    if (department.headId === managerEmployeeId) roots.add(department.id);
  });

  const visit = (id: string) => {
    if (result.has(id)) return;
    result.add(id);
    departments
      .filter((department) => department.parentId === id)
      .forEach((department) => visit(department.id));
  };
  roots.forEach(visit);
  return result;
}
