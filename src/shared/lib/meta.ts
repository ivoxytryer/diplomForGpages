import type {
  Absence,
  AbsenceStatus,
  AbsenceType,
  EmployeeStatus,
  EmploymentType,
  HrEventType,
  ProjectStatus,
  ProjectTaskStatus,
  Role,
  TimesheetCode,
  TimesheetStatus,
} from '@/shared/types';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple' | 'default';

type MetaEntry = { label: string; tone: Tone };

/**
 * Справочники читают данные из localStorage и API, поэтому ключ может
 * оказаться из старой версии схемы. Возвращаем нейтральную запись вместо
 * падения всего экрана на `undefined.tone`.
 */
function withFallback<T extends MetaEntry>(
  map: Record<string, T>,
  fallback: (key: string) => T,
): Record<string, T> {
  return new Proxy(map, {
    get(target, property, receiver) {
      if (typeof property === 'string' && !Object.prototype.hasOwnProperty.call(target, property)) {
        return fallback(property);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

const unknownMeta = (key: string): MetaEntry => ({
  label: key ? `Неизвестно (${key})` : 'Неизвестно',
  tone: 'neutral',
});

function withStringFallback<T extends string>(
  map: Record<string, T>,
  fallback: (key: string) => T,
): Record<string, T> {
  return new Proxy(map, {
    get(target, property, receiver) {
      if (typeof property === 'string' && !Object.prototype.hasOwnProperty.call(target, property)) {
        return fallback(property);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export const roleLabels: Record<Role, string> = withStringFallback(
  {
    admin: 'Администратор',
    hr: 'HR-специалист',
    manager: 'Руководитель',
    employee: 'Сотрудник',
  },
  (key) => (key ? `Неизвестная роль (${key})` : 'Неизвестная роль'),
);

export const employeeStatusMeta: Record<EmployeeStatus, MetaEntry> = withFallback<MetaEntry>(
  {
    active: { label: 'Работает', tone: 'neutral' },
    probation: { label: 'Испытательный', tone: 'neutral' },
    vacation: { label: 'В отпуске', tone: 'neutral' },
    sick_leave: { label: 'Больничный', tone: 'neutral' },
    dismissed: { label: 'Уволен', tone: 'neutral' },
  },
  unknownMeta,
);

export const employmentTypeLabels: Record<EmploymentType, string> = withStringFallback(
  {
    full: 'Полная занятость',
    part: 'Частичная занятость',
    contract: 'Договор ГПХ',
  },
  (key) => (key ? `Неизвестный тип занятости (${key})` : 'Неизвестный тип занятости'),
);

export const genderLabels = withStringFallback(
  { male: 'Мужской', female: 'Женский' },
  (key) => (key ? `Неизвестно (${key})` : 'Неизвестно'),
);

export const projectStatusMeta: Record<ProjectStatus, MetaEntry> = withFallback<MetaEntry>(
  {
    planning: { label: 'Планирование', tone: 'neutral' },
    active: { label: 'Активный', tone: 'neutral' },
    paused: { label: 'Приостановлен', tone: 'neutral' },
    completed: { label: 'Завершён', tone: 'neutral' },
  },
  unknownMeta,
);

export const taskStatusMeta: Record<ProjectTaskStatus, MetaEntry> = withFallback<MetaEntry>(
  {
    todo: { label: 'К выполнению', tone: 'neutral' },
    done: { label: 'Выполнено', tone: 'neutral' },
  },
  unknownMeta,
);

type AbsenceTypeEntry = { label: string; tone: Tone; code: TimesheetCode };

export const absenceTypeMeta: Record<AbsenceType, AbsenceTypeEntry> =
  withFallback<AbsenceTypeEntry>(
    {
      vacation: { label: 'Отпуск', tone: 'neutral', code: 'ОТ' },
      sick: { label: 'Больничный', tone: 'neutral', code: 'Б' },
      business_trip: { label: 'Командировка', tone: 'neutral', code: 'К' },
      unpaid: { label: 'Без сохранения', tone: 'neutral', code: 'Н' },
      study: { label: 'Учебный отпуск', tone: 'neutral', code: 'ОТ' },
    },
    (key) => ({
      label: key ? `Неизвестный тип (${key})` : 'Неизвестный тип',
      tone: 'neutral',
      code: '—',
    }),
  );

const absenceStatusMeta: Record<AbsenceStatus, MetaEntry> = withFallback<MetaEntry>(
  {
    pending: { label: 'На согласовании', tone: 'neutral' },
    approved: { label: 'Согласовано', tone: 'neutral' },
    rejected: { label: 'Отклонено', tone: 'neutral' },
  },
  unknownMeta,
);

/** У больничного нет «согласования» — только подтверждение. */
export function absenceStatusDisplay(absence: Pick<Absence, 'type' | 'status' | 'confirmedAt'>) {
  if (absence.type === 'sick') {
    if (absence.status === 'approved' || absence.confirmedAt) {
      return { label: 'Подтверждён', tone: 'success' as Tone };
    }
    if (absence.status === 'pending') {
      return { label: 'Ожидает подтверждения', tone: 'warning' as Tone };
    }
    return { label: 'Отклонён', tone: 'danger' as Tone };
  }
  return absenceStatusMeta[absence.status];
}

export const timesheetStatusMeta: Record<TimesheetStatus, MetaEntry> =
  withFallback<MetaEntry>(
    {
      draft: { label: 'Черновик', tone: 'neutral' },
      submitted: { label: 'На проверке', tone: 'warning' },
      approved: { label: 'Утверждён', tone: 'success' },
    },
    unknownMeta,
  );

type TimesheetCodeEntry = {
  label: string;
  short: string;
  tone: Tone;
  hours: number;
  paid: boolean;
};

export const timesheetCodeMeta: Record<TimesheetCode, TimesheetCodeEntry> =
  withFallback<TimesheetCodeEntry>(
    {
      Я: { label: 'Явка', short: 'Я', tone: 'success', hours: 8, paid: true },
      ОТ: { label: 'Отпуск', short: 'ОТ', tone: 'info', hours: 0, paid: true },
      Б: { label: 'Больничный', short: 'Б', tone: 'danger', hours: 0, paid: false },
      К: { label: 'Командировка', short: 'К', tone: 'purple', hours: 8, paid: true },
      П: { label: 'Прогул', short: 'П', tone: 'warning', hours: 0, paid: false },
      Н: { label: 'Без сохранения', short: 'Н', tone: 'neutral', hours: 0, paid: false },
      В: { label: 'Выходной / праздник', short: 'В', tone: 'neutral', hours: 0, paid: false },
      '—': { label: 'Вне периода работы', short: '—', tone: 'neutral', hours: 0, paid: false },
    },
    (key) => ({
      label: key ? `Код ${key}` : 'Неизвестный код',
      short: key || '?',
      tone: 'neutral',
      hours: 0,
      paid: false,
    }),
  );

export const timesheetCodes: TimesheetCode[] = ['Я', 'ОТ', 'Б', 'К', 'П', 'Н', 'В'];

export const eventTypeMeta: Record<HrEventType, MetaEntry> = withFallback<MetaEntry>(
  {
    hire: { label: 'Приём на работу', tone: 'neutral' },
    transfer: { label: 'Перевод', tone: 'neutral' },
    promotion: { label: 'Повышение', tone: 'neutral' },
    dismissal: { label: 'Увольнение', tone: 'neutral' },
    salary_change: { label: 'Изменение оклада', tone: 'neutral' },
    vacation: { label: 'Отпуск', tone: 'neutral' },
    sick_leave: { label: 'Больничный', tone: 'neutral' },
    business_trip: { label: 'Командировка', tone: 'neutral' },
    unpaid_leave: { label: 'Отпуск без сохранения', tone: 'neutral' },
  },
  unknownMeta,
);

/** Тип кадрового события, которым отражается согласованное отсутствие. */
export const absenceEventType: Record<AbsenceType, HrEventType> = {
  vacation: 'vacation',
  study: 'vacation',
  sick: 'sick_leave',
  business_trip: 'business_trip',
  unpaid: 'unpaid_leave',
};

export const absenceEventTitle: Record<AbsenceType, string> = {
  vacation: 'Оформлен отпуск',
  study: 'Оформлен учебный отпуск',
  sick: 'Оформлен больничный',
  business_trip: 'Оформлена командировка',
  unpaid: 'Оформлен отпуск без сохранения',
};
