import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';
import type { Department, Employee, Position, Project } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { managerZoneDepartmentIds } from '@/shared/lib/manager-zone';

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * API может временно вернуть не массив (например, HTML-заглушку при
 * перезапуске service worker). Справочники не должны из-за этого ронять UI.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function useLookups() {
  const user = useAuthStore((state) => state.user);
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: api.departments.list });
  const positionsQuery = useQuery({ queryKey: ['positions'], queryFn: api.positions.list });
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  const employeesQuery = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => api.employees.list({ pageSize: 500 }),
  });

  const departments = useMemo<Department[]>(
    () => asArray<Department>(departmentsQuery.data),
    [departmentsQuery.data],
  );
  const positions = useMemo<Position[]>(
    () => asArray<Position>(positionsQuery.data),
    [positionsQuery.data],
  );
  const projects = useMemo<Project[]>(
    () => asArray<Project>(projectsQuery.data),
    [projectsQuery.data],
  );
  const employees = useMemo<Employee[]>(
    () => asArray<Employee>(employeesQuery.data?.items),
    [employeesQuery.data],
  );

  /**
   * Список подразделений для фильтров. Менеджеру показываем только те отделы,
   * в которых есть доступные ему сотрудники (своя область и команды проектов),
   * чтобы выбор чужого отдела не давал пустой экран.
   */
  const availableDepartments = useMemo<Department[]>(() => {
    if (user?.role !== 'manager') return departments;
    const used = new Set(employees.map((employee) => employee.departmentId));
    return departments.filter((department) => used.has(department.id));
  }, [departments, employees, user?.role]);

  const maps = useMemo(
    () => ({
      departmentById: new Map(departments.map((item) => [item.id, item])),
      positionById: new Map(positions.map((item) => [item.id, item])),
      projectById: new Map(projects.map((item) => [item.id, item])),
      employeeById: new Map(employees.map((item) => [item.id, item])),
    }),
    [departments, positions, projects, employees],
  );

  return {
    departments,
    availableDepartments,
    positions,
    projects,
    employees,
    ...maps,
    isLoading:
      departmentsQuery.isLoading ||
      positionsQuery.isLoading ||
      projectsQuery.isLoading ||
      employeesQuery.isLoading,
  };
}

/**
 * Подразделения, где текущий руководитель согласует табель и отсутствия.
 * `null` — не руководитель (ограничение не применяется). Команды проектов
 * из других подразделений в эту зону не входят: там решение принимает
 * руководитель подразделения или HR.
 */
export function useManagerApprovalZone() {
  const user = useAuthStore((state) => state.user);
  const { departments, employeeById } = useLookups();
  return useMemo(() => {
    if (user?.role !== 'manager') return null;
    const ownDepartmentId = user.employeeId
      ? employeeById.get(user.employeeId)?.departmentId
      : null;
    return managerZoneDepartmentIds(departments, ownDepartmentId, user.employeeId);
  }, [departments, employeeById, user?.employeeId, user?.role]);
}
