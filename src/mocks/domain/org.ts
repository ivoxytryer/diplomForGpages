import { fullName } from '@/shared/lib/utils';
import type {
  Department,
  Employee,
  OrgStructureEmployee,
  OrgStructureNode,
  Position,
} from '@/shared/types';

export interface OrgTreeInput {
  departments: Department[];
  employees: Employee[];
  positions: Position[];
  /** Подразделения, доступные текущей роли. Если не задано — все. */
  allowedDepartmentIds?: Set<string>;
}

function toOrgEmployee(
  employee: Employee,
  positionById: Map<string, Position>,
): OrgStructureEmployee {
  return {
    id: employee.id,
    name: fullName(employee),
    positionName: positionById.get(employee.positionId)?.name,
  };
}

/**
 * Строит дерево подразделений для орг-структуры.
 * Численность считается только по активным сотрудникам, уволенные не входят.
 * Циклы в parentId не роняют страницу: такая ветка становится корнем.
 */
export function buildOrgTree(input: OrgTreeInput): OrgStructureNode[] {
  const allowed = input.allowedDepartmentIds;
  const departments = input.departments.filter(
    (department) => !allowed || allowed.has(department.id),
  );
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const activeEmployees = input.employees.filter(
    (employee) =>
      employee.status !== 'dismissed' && departmentById.has(employee.departmentId),
  );

  const employeesByDepartment = new Map<string, Employee[]>();
  activeEmployees.forEach((employee) => {
    const list = employeesByDepartment.get(employee.departmentId) ?? [];
    list.push(employee);
    employeesByDepartment.set(employee.departmentId, list);
  });
  employeesByDepartment.forEach((list) =>
    list.sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru')),
  );

  const parentIdOf = (department: Department) =>
    department.parentId && departmentById.has(department.parentId)
      ? department.parentId
      : null;

  const childrenByParent = new Map<string | null, Department[]>();
  departments.forEach((department) => {
    const parentId = parentIdOf(department);
    const list = childrenByParent.get(parentId) ?? [];
    list.push(department);
    childrenByParent.set(parentId, list);
  });
  childrenByParent.forEach((list) =>
    list.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  );

  const built = new Set<string>();

  const build = (department: Department, visiting: Set<string>): OrgStructureNode => {
    built.add(department.id);
    visiting.add(department.id);

    const children = (childrenByParent.get(department.id) ?? [])
      .filter((child) => !visiting.has(child.id))
      .map((child) => build(child, new Set(visiting)));

    const headEmployee = department.headId
      ? employeeById.get(department.headId)
      : undefined;
    const head =
      headEmployee &&
      headEmployee.status !== 'dismissed' &&
      departmentById.has(headEmployee.departmentId)
        ? toOrgEmployee(headEmployee, positionById)
        : null;

    const employees = (employeesByDepartment.get(department.id) ?? []).map((employee) =>
      toOrgEmployee(employee, positionById),
    );
    const directCount = employees.length;
    const totalCount =
      directCount + children.reduce((sum, child) => sum + child.totalCount, 0);
    const parentId = parentIdOf(department);

    return {
      id: department.id,
      name: department.name,
      code: department.code,
      parentId,
      parentName: parentId ? departmentById.get(parentId)?.name ?? null : null,
      head,
      directCount,
      totalCount,
      employees,
      children,
    };
  };

  const roots = departments
    .filter((department) => parentIdOf(department) === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map((department) => build(department, new Set()));

  // Страховка от циклов: подразделение с parentId внутри цикла не имеет корня.
  departments
    .filter((department) => !built.has(department.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .forEach((department) => {
      if (built.has(department.id)) return;
      roots.push(build(department, new Set()));
    });

  return roots;
}
