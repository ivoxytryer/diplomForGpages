import dayjs from 'dayjs';
import type {
  Absence,
  Assignment,
  AuditEntry,
  Db,
  Department,
  Employee,
  HrEvent,
  Position,
  Project,
  ProjectTaskStatus,
  VacationBalance,
} from '@/shared/types';
import { createSeed, seedPositions, seedProjectTasks } from './data';
import { hashPassword } from './password';
import { absenceEventType, timesheetCodes } from '@/shared/lib/meta';
import { absenceDayBreakdown } from '@/shared/lib/absences';
import {
  ABSENCE_STATUSES,
  ABSENCE_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  PROJECT_STATUSES,
  ROLES,
  TIMESHEET_STATUSES,
} from '@/shared/lib/enums';

const STORAGE_KEY = 'hr-system-db-v1';
const DEMO_PASSWORD = 'demo1234';

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Мягкая миграция localStorage-БД: дополняет недостающие коллекции
 * и поля, появившиеся в более поздних версиях демо-данных.
 */
function migrate(db: Db): Db {
  let changed = false;

  const ensureArray = (key: keyof Db, fallback: unknown[]) => {
    if (Array.isArray(db[key])) return;
    (db as unknown as Record<string, unknown>)[key] = fallback;
    changed = true;
  };

  ensureArray('employees', [] as Employee[]);
  ensureArray('departments', [] as Department[]);
  ensureArray('positions', [] as Position[]);
  ensureArray('projects', [] as Project[]);
  ensureArray('assignments', [] as Assignment[]);
  ensureArray('absences', [] as Absence[]);
  ensureArray('absenceTaskDecisions', []);
  ensureArray('vacationBalances', []);
  ensureArray('notifications', []);
  ensureArray('events', [] as HrEvent[]);
  ensureArray('audit', [] as AuditEntry[]);

  // Старые демо-данные хранили только категорию. Дополняем должности
  // подразделением, веткой и грейдом и добавляем недостающие грейды.
  const seededPositions = seedPositions();
  const seededById = new Map(seededPositions.map((position) => [position.id, position]));
  const positionIds = new Set(db.positions.map((position) => position.id));
  for (const position of seededPositions) {
    if (!positionIds.has(position.id)) {
      db.positions.push({ ...position });
      positionIds.add(position.id);
      changed = true;
    }
  }
  db.positions.forEach((position) => {
    const known = seededById.get(position.id);
    const legacy = position as Position & { category?: string };
    const departmentId = position.departmentId || known?.departmentId || db.departments[0]?.id || 'd1';
    const family = position.family || known?.family || legacy.category || 'Прочее';
    const grade =
      Number.isFinite(position.grade) && position.grade > 0
        ? position.grade
        : (known?.grade ?? 2);
    if (
      position.departmentId !== departmentId ||
      position.family !== family ||
      position.grade !== grade
    ) {
      position.departmentId = departmentId;
      position.family = family;
      position.grade = grade;
      changed = true;
    }
    if ('category' in legacy) {
      delete legacy.category;
      changed = true;
    }
  });

  if (!db.passwordHashes || typeof db.passwordHashes !== 'object') {
    db.passwordHashes = {};
    changed = true;
  }

  if (!db.timesheetOverrides || typeof db.timesheetOverrides !== 'object') {
    db.timesheetOverrides = {};
    changed = true;
  }

  if (!db.timesheetStatuses || typeof db.timesheetStatuses !== 'object') {
    db.timesheetStatuses = {};
    changed = true;
  }

  db.employees.forEach((employee) => {
    const status = oneOf(employee.status, EMPLOYEE_STATUSES, 'active');
    const gender = oneOf(employee.gender, GENDERS, 'male');
    const employmentType = oneOf(employee.employmentType, EMPLOYMENT_TYPES, 'full');
    if (status !== employee.status || gender !== employee.gender || employmentType !== employee.employmentType) {
      employee.status = status;
      employee.gender = gender;
      employee.employmentType = employmentType;
      changed = true;
    }
    // Старые документы (ИНН, СНИЛС, адрес) больше не хранятся в карточке.
    const legacy = employee as Employee & {
      inn?: string;
      snils?: string;
      address?: string;
    };
    (['inn', 'snils', 'address'] as const).forEach((key) => {
      if (key in legacy) {
        delete legacy[key];
        changed = true;
      }
    });
  });

  // Испытательный срок не требует ручного действия: если он истёк,
  // сотрудник автоматически переходит в статус «Работает».
  const today = dayjs().startOf('day');
  db.employees.forEach((employee) => {
    if (
      employee.status === 'probation' &&
      !dayjs(employee.hireDate).add(3, 'month').isAfter(today)
    ) {
      employee.status = 'active';
      changed = true;
    }
  });

  db.projects.forEach((project) => {
    const status = oneOf(project.status, PROJECT_STATUSES, 'planning');
    if (status !== project.status) {
      project.status = status;
      changed = true;
    }
  });

  // В старых демо-данных встречались коды и статусы, которых уже нет в схеме.
  // Нормализуем их один раз при загрузке, чтобы экраны не падали на справочниках.
  db.absences = db.absences.filter((absence) => {
    if (!ABSENCE_TYPES.includes(absence.type)) {
      changed = true;
      return false;
    }
    const status = oneOf(absence.status, ABSENCE_STATUSES, 'pending');
    if (status !== absence.status) {
      absence.status = status;
      changed = true;
    }
    const breakdown = absenceDayBreakdown(absence.type, absence.startDate, absence.endDate);
    if (
      absence.days !== breakdown.days ||
      absence.workingDays !== breakdown.workingDays ||
      absence.calendarDays !== breakdown.calendarDays
    ) {
      absence.days = breakdown.days;
      absence.workingDays = breakdown.workingDays;
      absence.calendarDays = breakdown.calendarDays;
      changed = true;
    }
    if (
      absence.type === 'sick' &&
      absence.status === 'approved' &&
      !absence.confirmedAt
    ) {
      absence.confirmedAt = absence.createdAt;
      absence.confirmedBy = absence.approvedBy ?? null;
      changed = true;
    }
    return true;
  });

  Object.entries(db.timesheetStatuses).forEach(([key, status]) => {
    const next = oneOf(status, TIMESHEET_STATUSES, 'draft');
    if (next !== status) {
      db.timesheetStatuses[key] = next;
      changed = true;
    }
  });

  Object.entries(db.timesheetOverrides).forEach(([key, list]) => {
    if (!Array.isArray(list)) {
      delete db.timesheetOverrides[key];
      changed = true;
      return;
    }
    const valid = list.filter((item) => timesheetCodes.includes(item.code));
    if (valid.length !== list.length) {
      db.timesheetOverrides[key] = valid;
      changed = true;
    }
  });

  if (!Array.isArray(db.projectTasks)) {
    db.projectTasks = seedProjectTasks();
    changed = true;
  } else {
    db.projectTasks = db.projectTasks.map((task) => {
      const carryHistory = Array.isArray(task.carryHistory) ? task.carryHistory : [];
      const completionHistory = Array.isArray(task.completionHistory) ? task.completionHistory : [];
      const originalDueDate = task.originalDueDate ?? task.dueDate;
      const carryCount = typeof task.carryCount === 'number' ? task.carryCount : carryHistory.length;
      const rawStatus = String(task.status);
      const status: ProjectTaskStatus =
        rawStatus === 'done' || rawStatus === 'completed' ? 'done' : 'todo';
      if (
        carryHistory !== task.carryHistory ||
        completionHistory !== task.completionHistory ||
        originalDueDate !== task.originalDueDate ||
        carryCount !== task.carryCount ||
        status !== task.status
      ) {
        changed = true;
      }
      return {
        ...task,
        carryHistory,
        completionHistory,
        originalDueDate,
        carryCount,
        status,
      };
    });
  }

  if (!Array.isArray(db.users)) {
    db.users = [];
    changed = true;
  }

  db.users.forEach((user) => {
    const role = oneOf(user.role, ROLES, 'employee');
    if (role !== user.role) {
      user.role = role;
      changed = true;
    }
    if (!db.passwordHashes[user.id]) {
      db.passwordHashes[user.id] = hashPassword(DEMO_PASSWORD, user.id);
      changed = true;
    }
    if (typeof user.mustChangePassword !== 'boolean') {
      user.mustChangePassword = false;
      changed = true;
    }
  });

  // Старые демо-базы не знали об остатках отпусков — создаём их для активных.
  const currentYear = new Date().getFullYear();
  let vacationSequence = db.vacationBalances.reduce((max, balance) => {
    const numeric = Number(balance.id.replace(/\D/g, ''));
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  }, 0);
  db.employees
    .filter((employee) => employee.status !== 'dismissed')
    .forEach((employee) => {
      if (
        db.vacationBalances.some(
          (balance) => balance.employeeId === employee.id && balance.year === currentYear,
        )
      ) {
        return;
      }
      vacationSequence += 1;
      const balance: VacationBalance = {
        id: `vb${String(vacationSequence).padStart(3, '0')}`,
        employeeId: employee.id,
        year: currentYear,
        entitlement: 28,
        carryover: 0,
        updatedAt: new Date().toISOString(),
      };
      db.vacationBalances.push(balance);
      changed = true;
    });

  const legacyDb = db as Db & { payslips?: unknown };
  if ('payslips' in legacyDb) {
    delete legacyDb.payslips;
    changed = true;
  }

  // Старые события об отпусках создавались без ссылки на заявку — связываем их,
  // чтобы правка и удаление заявки синхронизировались с лентой событий.
  const approvedAbsences = db.absences.filter((absence) => absence.status === 'approved');
  db.events = db.events.map((event) => {
    if (event.absenceId !== undefined) return event;
    if (!['vacation', 'sick_leave', 'business_trip', 'unpaid_leave'].includes(event.type)) {
      return event;
    }
    const match = approvedAbsences.find(
      (absence) =>
        absence.employeeId === event.employeeId &&
        absence.startDate === event.date &&
        absenceEventType[absence.type] === event.type,
    );
    if (!match) return event;
    changed = true;
    return { ...event, absenceId: match.id };
  });

  if (changed) saveDb(db);
  return db;
}

export function resetDb(): Db {
  const db = createSeed();
  saveDb(db);
  return db;
}

export function saveDb(db: Db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function loadDb(): Db {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return resetDb();
  try {
    const parsed = JSON.parse(raw) as Db;
    if (!parsed || !Array.isArray(parsed.employees)) return resetDb();
    return migrate(parsed);
  } catch {
    return resetDb();
  }
}
