import { loadDb, saveDb } from '../db';
import { canReadProject, nextId, notifyEmployee, pickFields, projectFields, projectView, pushAudit } from '../domain';
import { BASE, authUser } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { PROJECT_STATUSES } from '@/shared/lib/enums';
import { can } from '@/shared/lib/permissions';
import { fullName } from '@/shared/lib/utils';
import type { Project, ProjectPayload } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const projectHandlers = [
  http.get(`${BASE}/projects`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (user.role === 'employee') {
      const allowedProjectIds = new Set(
        db.assignments
          .filter((assignment) => assignment.employeeId === user.employeeId)
          .map((assignment) => assignment.projectId),
      );
      return HttpResponse.json(
        db.projects
          .filter((project) => allowedProjectIds.has(project.id))
          .map((project) => projectView(db, project)),
      );
    }
    return HttpResponse.json(db.projects.map((project) => projectView(db, project)));
  }),

  http.get(`${BASE}/projects/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const project = db.projects.find((item) => item.id === params.id);
    if (!project) return notFound('Проект не найден');
    if (!canReadProject(db, user, project.id)) {
      return forbidden('Нет доступа к проекту');
    }
    return HttpResponse.json(projectView(db, project));
  }),

  http.post(`${BASE}/projects`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as ProjectPayload;
    if (!PROJECT_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус проекта');
    }
    if (body.endDate && body.endDate < body.startDate) {
      return badRequest('Дата окончания проекта раньше даты начала');
    }
    if (user.role === 'manager') {
      if (!user.employeeId) {
        return forbidden('У руководителя нет привязанной карточки сотрудника');
      }
      if (body.managerId && body.managerId !== user.employeeId) {
        return forbidden('Руководитель может назначить руководителем только себя');
      }
    }
    const managerId =
      user.role === 'manager' ? user.employeeId : (body.managerId ?? null);
    if (managerId) {
      const manager = db.employees.find((item) => item.id === managerId);
      if (!manager) return badRequest('Руководитель проекта не найден');
      if (manager.status === 'dismissed') {
        return badRequest('Нельзя назначить уволенного сотрудника руководителем');
      }
    }
    const project: Project = {
      ...pickFields(body, projectFields),
      managerId,
      id: nextId('pr', db.projects),
    };
    db.projects.push(project);
    pushAudit(db, user, 'Создан проект', 'project', project.id, project.name);
    saveDb(db);
    return HttpResponse.json(project, { status: 201 });
  }),

  http.patch(`${BASE}/projects/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:write')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as Partial<ProjectPayload>;
    const project = db.projects.find((item) => item.id === params.id);
    if (!project) return notFound();
    if (user.role === 'manager') {
      if (project.managerId !== user.employeeId) {
        return forbidden('Можно редактировать только свои проекты');
      }
      if (body.managerId === null) {
        return badRequest('Выберите нового руководителя проекта');
      }
    }
    if (
      body.managerId !== undefined &&
      body.managerId !== project.managerId &&
      !can(user.role, 'projects:manage-manager')
    ) {
      return forbidden(
        'Менять руководителя проекта может администратор, HR или руководитель проекта',
      );
    }
    if (
      body.status !== undefined &&
      !PROJECT_STATUSES.includes(body.status)
    ) {
      return badRequest('Некорректный статус проекта');
    }
    const startDate = body.startDate ?? project.startDate;
    const endDate = body.endDate === undefined ? project.endDate : body.endDate;
    if (endDate && endDate < startDate) {
      return badRequest('Дата окончания проекта раньше даты начала');
    }
    let nextManagerName: string | null = null;
    if (body.managerId !== undefined && body.managerId !== null) {
      const manager = db.employees.find((item) => item.id === body.managerId);
      if (!manager) return badRequest('Руководитель проекта не найден');
      if (manager.status === 'dismissed') {
        return badRequest('Нельзя назначить уволенного сотрудника руководителем');
      }
      nextManagerName = fullName(manager);
    }
    const managerChanged =
      body.managerId !== undefined && body.managerId !== project.managerId;
    Object.assign(project, pickFields(body, projectFields));
    if (managerChanged && project.managerId) {
      notifyEmployee(db, project.managerId, {
        type: 'project_transfer',
        title: 'Вы назначены руководителем проекта',
        body: `${project.code} · ${project.name}`,
        link: `/projects/${project.id}`,
      });
    }
    pushAudit(
      db,
      user,
      'Изменён проект',
      'project',
      project.id,
      managerChanged && nextManagerName
        ? `${project.name} · новый руководитель: ${nextManagerName}`
        : project.name,
    );
    saveDb(db);
    return HttpResponse.json(project);
  }),

  http.delete(`${BASE}/projects/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'projects:delete')) return forbidden('Удалять проекты могут администратор и HR');
    const project = db.projects.find((item) => item.id === params.id);
    if (!project) return notFound();
    db.projects = db.projects.filter((item) => item.id !== project.id);
    db.assignments = db.assignments.filter((item) => item.projectId !== project.id);
    db.projectTasks = db.projectTasks.filter((item) => item.projectId !== project.id);
    pushAudit(db, user, 'Удалён проект', 'project', project.id, project.name);
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
