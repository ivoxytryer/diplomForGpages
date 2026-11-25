import type { Department } from '@/shared/types';

export function createsDepartmentCycle(departments: Department[], departmentId: string, parentId: string) {
  const seen = new Set<string>();
  let currentId: string | null | undefined = parentId;
  while (currentId) {
    if (currentId === departmentId) return true;
    if (seen.has(currentId)) return true;
    seen.add(currentId);
    const id: string = currentId;
    currentId = departments.find((department) => department.id === id)?.parentId;
  }
  return false;
}
