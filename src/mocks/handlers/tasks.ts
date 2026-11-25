import { loadDb, saveDb } from '../db';
import { canManageTasks, nextId, notifyEmployee, pushAudit } from '../domain';
import { BASE, authUser, str } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { PROJECT_TASK_STATUSES } from '@/shared/lib/enums';
import { postponeTaskDate, sortTasks } from '@/shared/lib/tasks';
import { formatDate, fullName, isValidDateString, todayISO } from '@/shared/lib/utils';
import type { ProjectTask, ProjectTaskPayload, ProjectTaskUpdatePayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

function estimateProblem(value: number | null | undefined) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    return 'Оценка должна быть числом от 0 до 1000 часов';
  }
  return null;
}

export const taskHandlers = [
  http.get(`${BASE}/tasks`, ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');

    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const projectId = str(url, 'projectId');
    const status = str(url, 'status');
    const mine = url.searchParams.get('mine') === 'true';

    let items = [...db.projectTasks];

    if (actor.role === 'employee') {
      items = actor.employeeId
        ? items.filter((item) => item.employeeId === actor.employeeId)
        : [];
    } else if (actor.role === 'manager') {
      const managedProjects = new Set(
        db.projects
          .filter((project) => project.managerId === actor.employeeId)
          .map((project) => project.id),
      );
      items = items.filter((item) => managedProjects.has(item.projectId));
      if (mine && actor.employeeId) {
        items = items.filter((item) => item.employeeId === actor.employeeId);
      } else if (employeeId) {
        items = items.filter((item) => item.employeeId === employeeId);
      }
    } else if (mine && actor.employeeId) {
      items = items.filter((item) => item.employeeId === actor.employeeId);
    } else if (employeeId) {
      items = items.filter((item) => item.employeeId === employeeId);
    }

    if (projectId) items = items.filter((item) => item.projectId === projectId);
    if (status) items = items.filter((item) => item.status === status);

    return HttpResponse.json(sortTasks(items));
  }),

  http.post(`${BASE}/tasks`, async ({ request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');
    if (!canManageTasks(actor)) {
      return forbidden('Создавать задачи могут администраторы и руководители');
    }

    const body = (await request.json()) as ProjectTaskPayload;
    const title = body.title?.trim();
    if (!body.projectId || !body.employeeId || !title || !body.dueDate) {
      return badRequest('Заполните проект, сотрудника, название и плановую дату');
    }
    if (!isValidDateString(body.dueDate)) {
      return badRequest('Некорректная плановая дата');
    }
    const estimateError = estimateProblem(body.estimateHours);
    if (estimateError) return badRequest(estimateError);

    const project = db.projects.find((item) => item.id === body.projectId);
    if (!project) return notFound('Проект не найден');
    if (actor.role === 'manager' && project.managerId !== actor.employeeId) {
      return forbidden('Ставить задачи можно только по своим проектам');
    }
    if (project.status === 'completed') {
      return badRequest('Нельзя создавать задачи по завершённому проекту');
    }

    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (employee.status === 'dismissed') {
      return badRequest('Нельзя назначить задачу уволенному сотруднику');
    }

    const assigned = db.assignments.some(
      (item) => item.projectId === body.projectId && item.employeeId === body.employeeId,
    );
    if (!assigned) {
      return badRequest('Сотрудник не назначен на этот проект');
    }

    const task: ProjectTask = {
      id: nextId('t', db.projectTasks),
      projectId: body.projectId,
      employeeId: body.employeeId,
      title,
      description: body.description?.trim() || undefined,
      dueDate: body.dueDate,
      estimateHours:
        body.estimateHours === undefined || body.estimateHours === null
          ? null
          : Number(body.estimateHours),
      status: 'todo',
      createdById: actor.id,
      createdByName: actor.name,
      createdAt: new Date().toISOString(),
      completedAt: null,
      originalDueDate: body.dueDate,
      carryCount: 0,
      carryHistory: [],
      completionHistory: [],
    };

    db.projectTasks.push(task);
    notifyEmployee(db, employee.id, {
      type: 'task_assigned',
      title: 'Новая задача',
      body: `${task.title} · срок ${formatDate(task.dueDate)}`,
      link: '/tasks',
    });
    pushAudit(
      db,
      actor,
      'Создана задача',
      'task',
      task.id,
      `${task.title} · ${fullName(employee)} · ${project.code}`,
    );
    saveDb(db);
    return HttpResponse.json(task, { status: 201 });
  }),

  http.patch(`${BASE}/tasks/:id`, async ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');

    const task = db.projectTasks.find((item) => item.id === params.id);
    if (!task) return notFound('Задача не найдена');
    const taskProject = db.projects.find((item) => item.id === task.projectId);
    if (actor.role === 'manager' && taskProject?.managerId !== actor.employeeId) {
      return forbidden('Можно изменять задачи только своих проектов');
    }

    const body = (await request.json()) as ProjectTaskUpdatePayload;
    if (body.status !== undefined && !PROJECT_TASK_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус задачи');
    }
    const manager = canManageTasks(actor);
    const own = Boolean(actor.employeeId && task.employeeId === actor.employeeId);

    if (!manager) {
      if (actor.role !== 'employee' || !own) {
        return forbidden('Можно изменять только свои задачи');
      }
      const allowed = Object.keys(body).every(
        (key) => key === 'status' || key === 'postpone' || key === 'completionComment',
      );
      if (!allowed) {
        return forbidden('Сотрудник может только выполнить или перенести задачу');
      }
    }

    let auditAction = 'Изменена задача';
    let auditDetails = task.title;

    if (body.employeeId !== undefined && body.employeeId !== task.employeeId) {
      if (!manager) {
        return forbidden('Переназначать задачу может руководитель или администратор');
      }
      const target = db.employees.find((item) => item.id === body.employeeId);
      if (!target) return notFound('Сотрудник не найден');
      if (target.status === 'dismissed') {
        return badRequest('Нельзя назначить задачу уволенному сотруднику');
      }
      const today = todayISO();
      const assigned = db.assignments.some(
        (assignment) =>
          assignment.projectId === task.projectId &&
          assignment.employeeId === target.id &&
          (!assignment.endDate || assignment.endDate >= today),
      );
      if (!assigned) {
        return badRequest('Сотрудник не назначен на проект');
      }
      task.employeeId = target.id;
      notifyEmployee(db, target.id, {
        type: 'task_assigned',
        title: 'Вам назначена задача',
        body: `${task.title} · срок ${formatDate(task.dueDate)}`,
        link: '/tasks',
      });
      auditAction = 'Задача переназначена';
      auditDetails = `${task.title} · ${fullName(target)}`;
    }

    if (body.postpone) {
      if (task.status !== 'todo') {
        return badRequest('Нельзя перенести выполненную задачу');
      }
      const from = task.dueDate;
      const to = postponeTaskDate(task.dueDate);
      task.dueDate = to;
      task.carryCount += 1;
      task.carryHistory.push({ from, to, at: new Date().toISOString() });
      auditAction = 'Задача перенесена';
      auditDetails = `${task.title} · ${from} → ${to}`;
    }

    if (body.status && body.status !== task.status) {
      task.status = body.status;
      task.completionHistory = task.completionHistory ?? [];
      const comment = body.completionComment?.trim() ?? '';
      const at = new Date().toISOString();
      if (body.status === 'done') {
        task.completedAt = at;
        task.completionComment = comment || undefined;
        task.completedById = actor.employeeId ?? actor.id;
        task.completedByName = actor.name;
      } else {
        task.completedAt = null;
        task.completionComment = undefined;
        task.completedById = null;
        task.completedByName = null;
      }
      task.completionHistory.push({
        action: body.status === 'done' ? 'done' : 'reopen',
        comment,
        at,
        byId: actor.id,
        byName: actor.name,
      });
      auditAction =
        body.status === 'done' ? 'Задача выполнена' : 'Задача возвращена в работу';
    } else if (body.status === 'done' && body.completionComment !== undefined) {
      task.completionHistory = task.completionHistory ?? [];
      const comment = body.completionComment.trim();
      task.completionComment = comment || undefined;
      task.completedById = actor.employeeId ?? actor.id;
      task.completedByName = actor.name;
      task.completionHistory.push({
        action: 'done',
        comment,
        at: new Date().toISOString(),
        byId: actor.id,
        byName: actor.name,
      });
    }

    if (manager) {
      if (body.title !== undefined) {
        const title = body.title.trim();
        if (!title) return badRequest('Название задачи не может быть пустым');
        task.title = title;
      }
      if (body.description !== undefined) {
        task.description = body.description.trim() || undefined;
      }
      if (!body.postpone && body.dueDate !== undefined) {
        if (!isValidDateString(body.dueDate)) {
          return badRequest('Некорректная плановая дата');
        }
        task.dueDate = body.dueDate;
      }
      if (body.estimateHours !== undefined) {
        const estimateError = estimateProblem(body.estimateHours);
        if (estimateError) return badRequest(estimateError);
        task.estimateHours =
          body.estimateHours === null ? null : Number(body.estimateHours);
      }
    }

    const employee = db.employees.find((item) => item.id === task.employeeId);
    if (body.status === 'done' && taskProject?.managerId) {
      notifyEmployee(db, taskProject.managerId, {
        type: 'task_completed',
        title: 'Задача выполнена',
        body: `${fullName(employee)} · ${task.title}`,
        link: `/projects/${task.projectId}`,
      });
    }
    pushAudit(
      db,
      actor,
      auditAction,
      'task',
      task.id,
      auditAction === 'Задача перенесена'
        ? auditDetails
        : `${task.title} · ${fullName(employee)}${
            task.completionComment ? ` · результат: ${task.completionComment}` : ''
          }`,
    );
    saveDb(db);
    return HttpResponse.json(task);
  }),

  http.delete(`${BASE}/tasks/:id`, ({ params, request }) => {
    const db = loadDb();
    const actor = authUser(request, db);
    if (!actor) return unauthorized('Сессия истекла');
    if (!canManageTasks(actor)) {
      return forbidden('Удалять задачи могут администраторы и руководители');
    }

    const task = db.projectTasks.find((item) => item.id === params.id);
    if (!task) return notFound('Задача не найдена');
    const taskProject = db.projects.find((item) => item.id === task.projectId);
    if (actor.role === 'manager' && taskProject?.managerId !== actor.employeeId) {
      return forbidden('Можно удалять задачи только своих проектов');
    }
    db.projectTasks = db.projectTasks.filter((item) => item.id !== task.id);
    pushAudit(db, actor, 'Удалена задача', 'task', task.id, task.title);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
