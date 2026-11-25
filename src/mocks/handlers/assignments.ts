import { loadDb, saveDb } from '../db';
import { assignmentFields, assignmentPeakLoad, dataScopeEmployeeIds, nextId, pickFields, pushAudit, validateOverload } from '../domain';
import { BASE, authUser, str } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { can } from '@/shared/lib/permissions';
import { fullName } from '@/shared/lib/utils';
import type { Assignment, AssignmentPayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const assignmentHandlers = [
  http.get(`${BASE}/assignments`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const projectId = str(url, 'projectId');
    const allowed = dataScopeEmployeeIds(db, user);
    let items = db.assignments.filter((item) => allowed.has(item.employeeId));
    if (projectId) {
      if (user.role === 'manager') {
        // Чужой проект: состав команды — не его данные. Показываем только
        // собственное назначение руководителя, если оно вообще есть.
        const project = db.projects.find((item) => item.id === projectId);
        if (project && project.managerId !== user.employeeId) {
          items = items.filter((item) => item.employeeId === user.employeeId);
        }
      }
      items = items.filter((item) => item.projectId === projectId);
    }
    if (employeeId) items = items.filter((item) => item.employeeId === employeeId);
    return HttpResponse.json(items);
  }),

  http.post(`${BASE}/assignments`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:manage-team')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as AssignmentPayload;
    const project = db.projects.find((item) => item.id === body.projectId);
    if (!project) return notFound('Проект не найден');
    if (project.status === 'completed') {
      return badRequest('Нельзя назначить сотрудника на завершённый проект');
    }
    if (user.role === 'manager' && project.managerId !== user.employeeId) {
      return forbidden('Можно управлять командой только своих проектов');
    }
    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (employee.status === 'dismissed') {
      return badRequest('Нельзя назначить на проект уволенного сотрудника');
    }
    if (!Number.isFinite(body.allocation) || body.allocation < 0 || body.allocation > 100) {
      return badRequest('Загрузка должна быть от 0 до 100%');
    }
    if (body.endDate && body.endDate < body.startDate) {
      return badRequest('Дата окончания назначения раньше даты начала');
    }
    if (
      db.assignments.some(
        (item) => item.projectId === body.projectId && item.employeeId === body.employeeId,
      )
    ) {
      return badRequest('Сотрудник уже назначен на этот проект');
    }
    const currentLoad = assignmentPeakLoad(
      db,
      body.employeeId,
      body.startDate,
      body.endDate,
    );
    const projectedLoad = currentLoad + body.allocation;
    const overloadProblem = validateOverload(user, projectedLoad, body.overloadReason);
    if (overloadProblem) return badRequest(overloadProblem);

    const assignment: Assignment = {
      ...pickFields(body, assignmentFields),
      overloadReason:
        projectedLoad > 100 ? body.overloadReason?.trim() : undefined,
      id: nextId('a', db.assignments),
    };
    db.assignments.push(assignment);
    pushAudit(
      db,
      user,
      'Создано назначение на проект',
      'assignment',
      assignment.id,
      `${fullName(employee)} · ${project.name} · ${assignment.allocation}%${
        assignment.overloadReason ? ` · перегруз: ${assignment.overloadReason}` : ''
      }`,
    );
    saveDb(db);
    return HttpResponse.json(assignment, { status: 201 });
  }),

  http.patch(`${BASE}/assignments/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:manage-team')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<AssignmentPayload>;
    const assignment = db.assignments.find((item) => item.id === params.id);
    if (!assignment) return notFound();
    const targetProjectId = body.projectId ?? assignment.projectId;
    if (user.role === 'manager') {
      const currentProject = db.projects.find((item) => item.id === assignment.projectId);
      const targetProject = db.projects.find((item) => item.id === targetProjectId);
      if (
        currentProject?.managerId !== user.employeeId ||
        targetProject?.managerId !== user.employeeId
      ) {
        return forbidden('Можно управлять командой только своих проектов');
      }
    }
    if (body.allocation !== undefined) {
      if (!Number.isFinite(body.allocation) || body.allocation < 0 || body.allocation > 100) {
        return badRequest('Загрузка должна быть от 0 до 100%');
      }
    }
    const projectId = body.projectId ?? assignment.projectId;
    const employeeId = body.employeeId ?? assignment.employeeId;
    const startDate = body.startDate ?? assignment.startDate;
    const endDate = body.endDate === undefined ? assignment.endDate : body.endDate;
    if (endDate && endDate < startDate) {
      return badRequest('Дата окончания назначения раньше даты начала');
    }
    const targetProject = db.projects.find((item) => item.id === projectId);
    if (!targetProject) return notFound('Проект не найден');
    if (targetProject.status === 'completed') {
      return badRequest('Нельзя назначить сотрудника на завершённый проект');
    }
    const targetEmployee = db.employees.find((item) => item.id === employeeId);
    if (!targetEmployee) return notFound('Сотрудник не найден');
    if (targetEmployee.status === 'dismissed') {
      return badRequest('Нельзя назначить на проект уволенного сотрудника');
    }
    if (
      db.assignments.some(
        (item) =>
          item.id !== assignment.id &&
          item.projectId === projectId &&
          item.employeeId === employeeId,
      )
    ) {
      return badRequest('Сотрудник уже назначен на этот проект');
    }
    const allocation = body.allocation ?? assignment.allocation;
    const currentLoad = assignmentPeakLoad(
      db,
      employeeId,
      startDate,
      endDate,
      assignment.id,
    );
    const projectedLoad = currentLoad + allocation;
    const overloadProblem = validateOverload(user, projectedLoad, body.overloadReason ?? assignment.overloadReason);
    if (overloadProblem) return badRequest(overloadProblem);
    Object.assign(assignment, pickFields(body, assignmentFields));
    assignment.overloadReason =
      projectedLoad > 100
        ? (body.overloadReason ?? assignment.overloadReason)?.trim()
        : undefined;
    const employee = db.employees.find((item) => item.id === assignment.employeeId);
    const project = db.projects.find((item) => item.id === assignment.projectId);
    pushAudit(
      db,
      user,
      'Изменено назначение на проект',
      'assignment',
      assignment.id,
      `${fullName(employee)} · ${project?.name ?? assignment.projectId} · ${assignment.allocation}%${
        assignment.overloadReason ? ` · перегруз: ${assignment.overloadReason}` : ''
      }`,
    );
    saveDb(db);
    return HttpResponse.json(assignment);
  }),

  http.delete(`${BASE}/assignments/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:manage-team')) return forbidden('Недостаточно прав');
    const assignment = db.assignments.find((item) => item.id === params.id);
    if (!assignment) return notFound();
    const project = db.projects.find((item) => item.id === assignment.projectId);
    if (user.role === 'manager' && project?.managerId !== user.employeeId) {
      return forbidden('Можно управлять командой только своих проектов');
    }
    const activeTasks = db.projectTasks.filter(
      (task) =>
        task.projectId === assignment.projectId &&
        task.employeeId === assignment.employeeId &&
        task.status === 'todo',
    );
    if (activeTasks.length) {
      return badRequest('Сначала переназначьте или закройте активные задачи сотрудника в проекте');
    }
    db.assignments = db.assignments.filter((item) => item.id !== assignment.id);
    const employee = db.employees.find((item) => item.id === assignment.employeeId);
    pushAudit(
      db,
      user,
      'Удалено назначение на проект',
      'assignment',
      assignment.id,
      `${fullName(employee)} · ${project?.name ?? assignment.projectId}`,
    );
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
