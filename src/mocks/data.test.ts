import { describe, expect, it } from 'vitest';
import { calculateLoad } from '@/shared/lib/workload';
import { todayISO } from '@/shared/lib/utils';
import { createSeed } from './data';

const db = createSeed();

const employeeIds = new Set(db.employees.map((employee) => employee.id));
const departmentIds = new Set(db.departments.map((department) => department.id));
const positionIds = new Set(db.positions.map((position) => position.id));
const projectIds = new Set(db.projects.map((project) => project.id));

describe('seed data integrity', () => {
  it('has unique identifiers', () => {
    const collections = [
      db.employees,
      db.departments,
      db.positions,
      db.projects,
      db.assignments,
      db.projectTasks,
      db.absences,
      db.absenceTaskDecisions,
      db.vacationBalances,
      db.events,
      db.users,
      db.notifications,
    ];
    collections.forEach((items) => {
      const ids = items.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('links employees to existing departments, positions and managers', () => {
    db.employees.forEach((employee) => {
      expect(departmentIds.has(employee.departmentId)).toBe(true);
      expect(positionIds.has(employee.positionId)).toBe(true);
      if (employee.managerId) expect(employeeIds.has(employee.managerId)).toBe(true);
    });
  });

  it('links departments to existing parents and heads', () => {
    db.departments.forEach((department) => {
      if (department.parentId) expect(departmentIds.has(department.parentId)).toBe(true);
      if (department.headId) expect(employeeIds.has(department.headId)).toBe(true);
    });
  });

  it('links projects, assignments and tasks to existing records', () => {
    db.projects.forEach((project) => {
      if (project.managerId) expect(employeeIds.has(project.managerId)).toBe(true);
    });
    db.assignments.forEach((assignment) => {
      expect(projectIds.has(assignment.projectId)).toBe(true);
      expect(employeeIds.has(assignment.employeeId)).toBe(true);
    });
    db.projectTasks.forEach((task) => {
      expect(projectIds.has(task.projectId)).toBe(true);
      expect(employeeIds.has(task.employeeId)).toBe(true);
    });
  });

  it('links absences, events and users to existing employees', () => {
    db.absences.forEach((absence) => {
      expect(employeeIds.has(absence.employeeId)).toBe(true);
    });
    db.events.forEach((event) => {
      expect(employeeIds.has(event.employeeId)).toBe(true);
    });
    db.users.forEach((user) => {
      if (user.employeeId) expect(employeeIds.has(user.employeeId)).toBe(true);
    });
    db.absenceTaskDecisions.forEach((decision) => {
      const absence = db.absences.find((item) => item.id === decision.absenceId);
      const task = db.projectTasks.find((item) => item.id === decision.taskId);
      expect(absence).toBeTruthy();
      expect(task).toBeTruthy();
      expect(employeeIds.has(decision.fromEmployeeId)).toBe(true);
      if (decision.toEmployeeId) expect(employeeIds.has(decision.toEmployeeId)).toBe(true);
    });
    db.vacationBalances.forEach((balance) => {
      expect(employeeIds.has(balance.employeeId)).toBe(true);
    });
    db.notifications.forEach((notification) => {
      expect(db.users.some((user) => user.id === notification.userId)).toBe(true);
    });
  });

  it('не создаёт сотрудников с активной загрузкой выше 100%', () => {
    const today = todayISO();
    db.employees
      .filter((employee) => employee.status !== 'dismissed')
      .forEach((employee) => {
        expect(
          calculateLoad(db.assignments, db.projects, employee.id, today),
          `${employee.lastName} ${employee.firstName}`,
        ).toBeLessThanOrEqual(100);
      });
  });

  it('has consistent ranges, dates and unique emails', () => {
    expect(new Set(db.employees.map((employee) => employee.email.toLowerCase())).size).toBe(
      db.employees.length,
    );
    expect(new Set(db.users.map((user) => user.email.toLowerCase())).size).toBe(db.users.length);

    db.assignments.forEach((assignment) => {
      expect(assignment.allocation).toBeGreaterThanOrEqual(0);
      expect(assignment.allocation).toBeLessThanOrEqual(100);
    });
    db.absences.forEach((absence) => {
      expect(absence.endDate >= absence.startDate).toBe(true);
      expect(absence.days).toBeGreaterThan(0);
    });
    db.positions.forEach((position) => {
      expect(position.salaryMin).toBeLessThanOrEqual(position.salaryMax);
    });
    db.projects.forEach((project) => {
      if (project.endDate) expect(project.endDate >= project.startDate).toBe(true);
    });
  });
});
