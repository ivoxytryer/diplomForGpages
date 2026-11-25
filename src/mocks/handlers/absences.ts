import { loadDb, saveDb } from '../db';
import { absenceFields, absenceUpdateFields, assignmentLoadAt, canApproveAbsenceFor, canReadAbsence, clearAbsenceOverrides, dataScopeEmployeeIds, nextId, notifyEmployee, notifyHrAndAdmin, pickFields, pushAudit, syncAbsenceEvent, syncEmployeeStatus, vacationLimitError } from '../domain';
import { BASE, authUser, str } from './context';
import { badRequest, forbidden, notFound, unauthorized } from './http';
import { absenceDayBreakdown, findAbsenceOverlap } from '@/shared/lib/absences';
import { ABSENCE_STATUSES, ABSENCE_TYPES } from '@/shared/lib/enums';
import { absenceTypeMeta } from '@/shared/lib/meta';
import { can } from '@/shared/lib/permissions';
import { formatDate, fullName, isValidDateString } from '@/shared/lib/utils';
import type { Absence, AbsencePayload, AbsenceTaskDecision, AbsenceTaskDecisionRecord, AbsenceTaskHandover, TaskHandoverCandidate } from '@/shared/types';
import { HttpResponse, http } from 'msw';

export const absenceHandlers = [
  http.get(`${BASE}/absences`, ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const url = new URL(request.url);
    const employeeId = str(url, 'employeeId');
    const status = str(url, 'status');
    const month = str(url, 'month');
    const allowed = dataScopeEmployeeIds(db, user);
    let items = db.absences.filter((item) => allowed.has(item.employeeId));
    if (employeeId) {
      if (!canReadAbsence(db, user, employeeId)) {
        return forbidden('Нет доступа к отсутствиям сотрудника');
      }
      items = items.filter((item) => item.employeeId === employeeId);
    }
    if (status) items = items.filter((item) => item.status === status);
    if (month) {
      items = items.filter(
        (item) => item.startDate <= `${month}-31` && item.endDate >= `${month}-01`,
      );
    }
    items.sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')));
    return HttpResponse.json(items);
  }),

  http.get(`${BASE}/absences/:id/task-handover`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound('Заявка не найдена');
    if (!canApproveAbsenceFor(db, user, absence)) {
      return forbidden('Нельзя просматривать задачи этой заявки');
    }

    const tasks = db.projectTasks.filter(
      (task) => task.employeeId === absence.employeeId && task.status === 'todo',
    );

    const data: AbsenceTaskHandover = {
      absenceId: absence.id,
      tasks: tasks.map((task) => {
        const projectAssignments = db.assignments.filter(
          (assignment) =>
            assignment.projectId === task.projectId &&
            assignment.employeeId !== absence.employeeId &&
            assignment.startDate <= absence.endDate &&
            (!assignment.endDate || assignment.endDate >= absence.startDate),
        );
        const candidates: TaskHandoverCandidate[] = [];
        const seen = new Set<string>();

        for (const assignment of projectAssignments) {
          if (seen.has(assignment.employeeId)) continue;
          seen.add(assignment.employeeId);
          const employee = db.employees.find((item) => item.id === assignment.employeeId);
          if (!employee || employee.status === 'dismissed') continue;
          const targetAbsence = findAbsenceOverlap(db.absences, {
            employeeId: employee.id,
            startDate: absence.startDate,
            endDate: absence.endDate,
            statuses: ['approved'],
          });
          if (targetAbsence) continue;
          const load = assignmentLoadAt(db, employee.id, absence.startDate);
          if (load >= 100) continue;
          candidates.push({
            employeeId: employee.id,
            employeeName: fullName(employee),
            projectRole: assignment.projectRole,
            load,
          });
        }

        candidates.sort((a, b) => a.load - b.load || a.employeeName.localeCompare(b.employeeName, 'ru'));
        return { task, candidates };
      }),
    };

    return HttpResponse.json(data);
  }),

  http.post(`${BASE}/absences`, async ({ request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'absences:create')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as AbsencePayload;
    if (user.role !== 'admin' && (!user.employeeId || body.employeeId !== user.employeeId)) {
      return forbidden('Можно создать заявку только на себя');
    }
    if (!ABSENCE_TYPES.includes(body.type)) {
      return badRequest('Некорректный тип отсутствия');
    }
    if (!isValidDateString(body.startDate) || !isValidDateString(body.endDate)) {
      return badRequest('Укажите корректные даты отсутствия');
    }
    if (body.endDate < body.startDate) return badRequest('Дата окончания раньше даты начала');
    const employee = db.employees.find((item) => item.id === body.employeeId);
    if (!employee) return notFound('Сотрудник не найден');
    if (employee.status === 'dismissed') {
      return badRequest('Нельзя создать отсутствие уволенному сотруднику');
    }
    const overlap = findAbsenceOverlap(db.absences, {
      employeeId: body.employeeId,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    if (overlap) {
      return badRequest(
        `Период пересекается с существующей заявкой ${overlap.startDate} — ${overlap.endDate}`,
      );
    }
    const breakdown = absenceDayBreakdown(body.type, body.startDate, body.endDate);
    const vacationProblem = vacationLimitError(
      db,
      body.employeeId,
      body.type,
      body.startDate,
      body.endDate,
    );
    if (vacationProblem) return badRequest(vacationProblem);
    const absence: Absence = {
      ...pickFields(body, absenceFields),
      id: nextId('ab', db.absences),
      ...breakdown,
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedBy: null,
    };
    db.absences.push(absence);
    const requestTitle = `${absenceTypeMeta[absence.type].label}: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}`;
    notifyHrAndAdmin(
      db,
      {
        type: 'absence_request',
        title: 'Новая заявка на согласование',
        body: `${fullName(employee)} · ${requestTitle}`,
        link: '/absences?status=pending&scope=all',
      },
      user.id,
    );
    if (employee.managerId) {
      notifyEmployee(db, employee.managerId, {
        type: 'absence_request',
        title: 'Заявка сотрудника на согласование',
        body: `${fullName(employee)} · ${requestTitle}`,
        link: '/absences?status=pending&scope=all',
      });
    }
    pushAudit(db, user, 'Создана заявка на отсутствие', 'absence', absence.id, absenceTypeMeta[absence.type].label);
    saveDb(db);
    return HttpResponse.json(absence, { status: 201 });
  }),

  http.patch(`${BASE}/absences/:id/status`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    if (!can(user.role, 'absences:approve')) return forbidden('Недостаточно прав');
    const body = (await request.json()) as {
      status: Absence['status'];
      taskDecisions?: AbsenceTaskDecision[];
    };
    if (!ABSENCE_STATUSES.includes(body.status)) {
      return badRequest('Некорректный статус заявки');
    }
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound('Заявка не найдена');
    if (!canApproveAbsenceFor(db, user, absence)) {
      return forbidden('Нельзя согласовывать заявку вне своей зоны ответственности');
    }
    if (absence.type === 'sick' && body.status !== 'approved') {
      return badRequest('Больничный можно только подтвердить');
    }
    if (body.status === 'approved') {
      if (user.employeeId === absence.employeeId && user.role !== 'admin') {
        return forbidden('Собственную заявку может согласовать только администратор');
      }
      const overlap = findAbsenceOverlap(db.absences, {
        employeeId: absence.employeeId,
        startDate: absence.startDate,
        endDate: absence.endDate,
        excludeId: absence.id,
        statuses: ['approved'],
      });
      if (overlap) {
        return badRequest(
          `Период пересекается с согласованным отсутствием ${overlap.startDate} — ${overlap.endDate}`,
        );
      }

      const activeTasks = db.projectTasks.filter(
        (task) => task.employeeId === absence.employeeId && task.status === 'todo',
      );
      const activeTaskIds = new Set(activeTasks.map((task) => task.id));
      const decisions = Array.isArray(body.taskDecisions) ? body.taskDecisions : [];
      const seenTaskIds = new Set<string>();

      for (const decision of decisions) {
        if (!activeTaskIds.has(decision.taskId)) {
          return badRequest('Задача не найдена среди активных задач сотрудника');
        }
        if (seenTaskIds.has(decision.taskId)) {
          return badRequest('По одной задаче можно принять только одно решение');
        }
        seenTaskIds.add(decision.taskId);
        if (decision.action !== 'keep' && decision.action !== 'reassign') {
          return badRequest('Некорректное действие по задаче');
        }
        if (decision.action === 'reassign') {
          if (!decision.employeeId) {
            return badRequest('Выберите нового исполнителя задачи');
          }
          if (decision.employeeId === absence.employeeId) {
            return badRequest('Нельзя переназначить задачу на самого отсутствующего сотрудника');
          }
          const target = db.employees.find((item) => item.id === decision.employeeId);
          if (!target) return notFound('Новый исполнитель не найден');
          if (target.status === 'dismissed') {
            return badRequest('Нельзя назначить задачу уволенному сотруднику');
          }
          const task = activeTasks.find((item) => item.id === decision.taskId)!;
          const assigned = db.assignments.some(
            (assignment) =>
              assignment.projectId === task.projectId &&
              assignment.employeeId === target.id &&
              assignment.startDate <= absence.endDate &&
              (!assignment.endDate || assignment.endDate >= absence.startDate),
          );
          if (!assigned) {
            return badRequest('Новый исполнитель не назначен на проект');
          }
          const targetAbsence = findAbsenceOverlap(db.absences, {
            employeeId: target.id,
            startDate: absence.startDate,
            endDate: absence.endDate,
            statuses: ['approved'],
          });
          if (targetAbsence) {
            return badRequest(
              `У сотрудника согласовано отсутствие ${targetAbsence.startDate} — ${targetAbsence.endDate}`,
            );
          }
          if (assignmentLoadAt(db, target.id, absence.startDate) >= 100) {
            return badRequest('У сотрудника уже 100% загрузки — выберите другого исполнителя');
          }
        }
      }

      for (const decision of decisions) {
        const task = activeTasks.find((item) => item.id === decision.taskId)!;
        if (decision.action === 'reassign') {
          task.employeeId = decision.employeeId!;
        }
        const record: AbsenceTaskDecisionRecord = {
          id: nextId('atd', db.absenceTaskDecisions),
          absenceId: absence.id,
          taskId: task.id,
          action: decision.action,
          fromEmployeeId: absence.employeeId,
          toEmployeeId: decision.action === 'reassign' ? decision.employeeId! : null,
          comment: decision.comment?.trim() || undefined,
          byUserId: user.id,
          byUserName: user.name,
          at: new Date().toISOString(),
        };
        db.absenceTaskDecisions.push(record);
        pushAudit(
          db,
          user,
          decision.action === 'keep' ? 'Задача оставлена сотруднику' : 'Задача переназначена',
          'task',
          task.id,
          `${task.title}${
            decision.action === 'reassign'
              ? ` · ${fullName(db.employees.find((item) => item.id === decision.employeeId))}`
              : ' · на время отсутствия'
          }${decision.comment ? ` · ${decision.comment}` : ''}`,
        );
      }
    }
    absence.status = body.status;
    absence.approvedBy = body.status === 'approved' ? (user.employeeId ?? null) : null;
    if (absence.type === 'sick' && body.status === 'approved') {
      absence.confirmedAt = new Date().toISOString();
      absence.confirmedBy = user.employeeId ?? null;
    } else {
      absence.confirmedAt = null;
      absence.confirmedBy = null;
    }
    if (body.status === 'approved') clearAbsenceOverrides(db, absence);
    syncEmployeeStatus(db, absence.employeeId);
    syncAbsenceEvent(db, absence, user);
    const auditAction =
      body.status === 'approved'
        ? 'Согласовано отсутствие'
        : body.status === 'rejected'
          ? 'Отклонено отсутствие'
          : 'Заявка возвращена на согласование';
    pushAudit(
      db,
      user,
      auditAction,
      'absence',
      absence.id,
      absenceTypeMeta[absence.type].label,
    );
    notifyEmployee(db, absence.employeeId, {
      type: 'absence_decision',
      title:
        body.status === 'approved'
          ? 'Заявка согласована'
          : body.status === 'rejected'
            ? 'Заявка отклонена'
            : 'Заявка возвращена на согласование',
      body: `${absenceTypeMeta[absence.type].label}: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}`,
      link: '/absences',
    });
    saveDb(db);
    return HttpResponse.json(absence);
  }),

  http.patch(`${BASE}/absences/:id`, async ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const body = (await request.json()) as Partial<AbsencePayload>;
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound();
    if (absence.status === 'approved') {
      return badRequest(
        'Согласованную заявку нельзя редактировать. Верните её на согласование или отклоните.',
      );
    }
    const isApprover = canApproveAbsenceFor(db, user, absence);
    const isOwnPending =
      user.employeeId !== null &&
      user.employeeId !== undefined &&
      user.employeeId === absence.employeeId &&
      absence.status === 'pending';
    if (!isApprover && !isOwnPending) return forbidden('Недостаточно прав');
    if (body.type !== undefined && !ABSENCE_TYPES.includes(body.type)) {
      return badRequest('Некорректный тип отсутствия');
    }
    const startDate = body.startDate ?? absence.startDate;
    const endDate = body.endDate ?? absence.endDate;
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      return badRequest('Укажите корректные даты отсутствия');
    }
    if (endDate < startDate) return badRequest('Дата окончания раньше даты начала');
    const overlap = findAbsenceOverlap(db.absences, {
      employeeId: absence.employeeId,
      startDate,
      endDate,
      excludeId: absence.id,
    });
    if (overlap) {
      return badRequest(
        `Период пересекается с существующей заявкой ${overlap.startDate} — ${overlap.endDate}`,
      );
    }
    const nextType = body.type ?? absence.type;
    const vacationProblem = vacationLimitError(
      db,
      absence.employeeId,
      nextType,
      startDate,
      endDate,
      absence.id,
    );
    if (vacationProblem) return badRequest(vacationProblem);
    Object.assign(absence, pickFields(body, absenceUpdateFields));
    Object.assign(
      absence,
      absenceDayBreakdown(absence.type, absence.startDate, absence.endDate),
    );
    syncEmployeeStatus(db, absence.employeeId);
    syncAbsenceEvent(db, absence, user);
    pushAudit(
      db,
      user,
      'Изменена заявка на отсутствие',
      'absence',
      absence.id,
      absenceTypeMeta[absence.type].label,
    );
    saveDb(db);
    return HttpResponse.json(absence);
  }),

  http.delete(`${BASE}/absences/:id`, ({ params, request }) => {
    const db = loadDb();
    const user = authUser(request, db);
    if (!user) return unauthorized('Сессия истекла');
    const absence = db.absences.find((item) => item.id === params.id);
    if (!absence) return notFound('Заявка не найдена');
    if (absence.status === 'approved') {
      return badRequest(
        'Согласованную заявку нельзя удалить. Сначала отклоните её или верните на согласование.',
      );
    }
    const isApprover = canApproveAbsenceFor(db, user, absence);
    const isOwnPending =
      user.employeeId !== null &&
      user.employeeId !== undefined &&
      user.employeeId === absence.employeeId &&
      absence.status === 'pending';
    if (!isApprover && !isOwnPending) return forbidden('Недостаточно прав');
    db.absences = db.absences.filter((item) => item.id !== absence.id);
    db.absenceTaskDecisions = db.absenceTaskDecisions.filter(
      (item) => item.absenceId !== absence.id,
    );
    db.events = db.events.filter((event) => event.absenceId !== absence.id);
    syncEmployeeStatus(db, absence.employeeId);
    pushAudit(
      db,
      user,
      'Удалена заявка на отсутствие',
      'absence',
      absence.id,
      absenceTypeMeta[absence.type].label,
    );
    saveDb(db);
    return HttpResponse.json({ ok: true });
  }),
];
