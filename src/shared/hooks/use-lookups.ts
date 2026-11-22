import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';
import type { Department, Employee, Position, Project } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';

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

export function useManagerDepartmentId() {
  const user = useAuthStore((state) => state.user);
  const { employeeById } = useLookups();
  if (user?.role !== 'manager' || !user.employeeId) return undefined;
  return employeeById.get(user.employeeId)?.departmentId;
}
