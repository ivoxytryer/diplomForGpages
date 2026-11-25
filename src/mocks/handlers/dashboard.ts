import dayjs from 'dayjs';
import { loadDb } from '../db';
import { birthdayInfo, managerScopeDepartmentIds, scopeEmployeeIds } from '../domain';
import { BASE, authUser, str } from './context';
import { forbidden, unauthorized } from './http';
import { monthKey, todayISO } from '@/shared/lib/utils';
import { calculateLoad } from '@/shared/lib/workload';
import type { DashboardData } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'employee') return forbidden('Дашборд недоступен сотруднику');
    const url = new URL(request.url);
    const departmentId = str(url, 'departmentId');
    const today = todayISO();
    const currentMonth = monthKey();
    const managerDepartments =
      user.role === 'manager' && user.employeeId
        ? managerScopeDepartmentIds(db, user.employeeId)
        : null;
    if (departmentId && managerDepartments && !managerDepartments.has(departmentId)) {
      return forbidden('Нет доступа к этому подразделению');
    }
    // Одна и та же область видимости для всех метрик: подразделения менеджера,
    // дочерние, подразделения где он руководитель, и команды его проектов.
    const allowed = scopeEmployeeIds(db, user);
    const scopedEmployees = db.employees.filter(
      (employee) =>
        allowed.has(employee.id) &&
        (!departmentId || employee.departmentId === departmentId),
    );
    const employees = scopedEmployees.filter((employee) => employee.status !== 'dismissed');
    const ids = new Set(employees.map((employee) => employee.id));
    const eventEmployeeIds = new Set(employees.map((employee) => employee.id));
    const activeProjects = db.projects.filter((project) => project.status === 'active');
    const totalAllocation = employees.reduce(
      (sum, employee) =>
        sum + calculateLoad(db.assignments, db.projects, employee.id, today),
      0,
    );
    const avgUtilization = employees.length ? Math.round(totalAllocation / employees.length) : 0;

    const byDepartmentMap = new Map<string, number>();
    employees.forEach((employee) => {
      const department = db.departments.find((item) => item.id === employee.departmentId);
      const name = department?.name ?? 'Без подразделения';
      byDepartmentMap.set(name, (byDepartmentMap.get(name) ?? 0) + 1);
    });

    const dynamics = Array.from({ length: 6 }, (_, index) => {
      const month = dayjs().subtract(5 - index, 'month').format('YYYY-MM');
      const hired = scopedEmployees.filter((employee) =>
        employee.hireDate.startsWith(month),
      ).length;
      const dismissed = scopedEmployees.filter(
        (employee) =>
          employee.status === 'dismissed' &&
          employee.dismissalDate?.startsWith(month),
      ).length;
      return { month, hired, dismissed };
    });

    const teamByProject = activeProjects.map((project) => ({
      name: project.name,
      count: new Set(
        db.assignments
          .filter(
            (assignment) =>
              assignment.projectId === project.id &&
              ids.has(assignment.employeeId) &&
              assignment.startDate <= today &&
              (!assignment.endDate || assignment.endDate >= today),
          )
          .map((assignment) => assignment.employeeId),
      ).size,
    }));

    // Менеджеру дни рождения не показываем: его дашборд ограничен своим
    // подразделением, а сотрудники из других подразделений в него не входят.
    const birthdays =
      user.role === 'manager'
        ? []
        : employees
            .map((employee) => ({ employeeId: employee.id, ...birthdayInfo(employee.birthDate) }))
            .filter((item) => item.daysLeft <= 30)
            .sort((a, b) => a.daysLeft - b.daysLeft);

    const absentToday = db.absences.filter(
      (absence) =>
        ids.has(absence.employeeId) &&
        absence.status === 'approved' &&
        absence.startDate <= today &&
        absence.endDate >= today,
    ).length;

    const pendingAbsences = db.absences.filter(
      (absence) => ids.has(absence.employeeId) && absence.status === 'pending',
    ).length;

    const recentEvents = db.events
      .filter((event) => eventEmployeeIds.has(event.employeeId))
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
      .slice(0, 8);

    const data: DashboardData = {
      headcount: employees.length,
      probation: employees.filter((employee) => employee.status === 'probation').length,
      hiredThisMonth: scopedEmployees.filter((employee) =>
        employee.hireDate.startsWith(currentMonth),
      ).length,
      dismissedThisMonth: scopedEmployees.filter(
        (employee) =>
          employee.status === 'dismissed' &&
          employee.dismissalDate?.startsWith(currentMonth),
      ).length,
      activeProjects: activeProjects.length,
      avgUtilization,
      absentToday,
      pendingAbsences,
      byDepartment: [...byDepartmentMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      dynamics,
      teamByProject: teamByProject.sort((a, b) => b.count - a.count).slice(0, 6),
      birthdays,
      recentEvents,
    };
    return HttpResponse.json(data);
  }),
];
