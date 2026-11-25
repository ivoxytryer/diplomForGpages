import dayjs, { type Dayjs } from 'dayjs';
import type { CalendarDayKind } from '@/shared/types';

/**
 * Производственный календарь РФ.
 *
 * Пока ведём федеральную пятидневку. Праздники и переносы заданы данными,
 * а не вычисляются из «выходных», поэтому календарь можно обновлять каждый год
 * без правок алгоритмов табеля, отсутствий и задач.
 */
export interface CalendarDay {
  date: string;
  kind: CalendarDayKind;
  hours: number;
  name?: string;
  source?: string;
}

type Override = { kind: CalendarDayKind; name?: string; source?: string; hours?: number };

const SOURCE_2026 = 'Постановление Правительства РФ от 24.09.2025 № 1466';
const SOURCE_2027 = 'Постановление Правительства РФ от 17.09.2026 № 1187';

/** Нерабочие праздничные дни 2026 года (ст. 112 ТК РФ). */
const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': 'Новогодние каникулы',
  '2026-01-02': 'Новогодние каникулы',
  '2026-01-03': 'Новогодние каникулы',
  '2026-01-04': 'Новогодние каникулы',
  '2026-01-05': 'Новогодние каникулы',
  '2026-01-06': 'Новогодние каникулы',
  '2026-01-07': 'Рождество Христово',
  '2026-01-08': 'Новогодние каникулы',
  '2026-02-23': 'День защитника Отечества',
  '2026-03-08': 'Международный женский день',
  '2026-05-01': 'Праздник Весны и Труда',
  '2026-05-09': 'День Победы',
  '2026-06-12': 'День России',
  '2026-11-04': 'День народного единства',
};

/** Перенесённые выходные 2026 года. */
const TRANSFERRED_OFF_2026: Record<string, string> = {
  '2026-01-09': 'Перенос выходного с 3 января',
  '2026-03-09': 'Перенос выходного с 8 марта',
  '2026-05-11': 'Перенос выходного с 9 мая',
  '2026-12-31': 'Перенос выходного с 4 января',
};

/** Предпраздничные дни, сокращённые на один час. */
const SHORTENED_2026 = new Set([
  '2026-04-30',
  '2026-05-08',
  '2026-06-11',
  '2026-11-03',
]);

/** Нерабочие праздничные дни 2027 года (ст. 112 ТК РФ). */
const HOLIDAYS_2027: Record<string, string> = {
  '2027-01-01': 'Новогодние каникулы',
  '2027-01-02': 'Новогодние каникулы',
  '2027-01-03': 'Новогодние каникулы',
  '2027-01-04': 'Новогодние каникулы',
  '2027-01-05': 'Новогодние каникулы',
  '2027-01-06': 'Новогодние каникулы',
  '2027-01-07': 'Рождество Христово',
  '2027-01-08': 'Новогодние каникулы',
  '2027-02-23': 'День защитника Отечества',
  '2027-03-08': 'Международный женский день',
  '2027-05-01': 'Праздник Весны и Труда',
  '2027-05-09': 'День Победы',
  '2027-06-12': 'День России',
  '2027-11-04': 'День народного единства',
};

/**
 * Перенесённые выходные 2027 года.
 * 20 февраля — рабочая суббота, сокращённая на час (перенос на 22 февраля).
 */
const TRANSFERRED_OFF_2027: Record<string, string> = {
  '2027-02-22': 'Перенос выходного с 20 февраля',
  '2027-05-03': 'Перенос выходного с 1 мая',
  '2027-05-10': 'Перенос выходного с 9 мая',
  '2027-06-14': 'Перенос выходного с 12 июня',
  '2027-11-05': 'Перенос выходного с 2 января',
  '2027-12-31': 'Перенос выходного с 3 января',
};

const WORKING_SATURDAYS_2027: Record<string, string> = {
  '2027-02-20': 'Рабочая суббота (перенос с 22 февраля)',
};

/** Предпраздничные дни 2027 года, сокращённые на один час. */
const SHORTENED_2027 = new Set(['2027-04-30', '2027-06-11', '2027-11-03']);

const CALENDAR_YEARS = new Set([2026, 2027]);

const overrides = new Map<string, Override>();
Object.entries(HOLIDAYS_2026).forEach(([date, name]) => {
  overrides.set(date, { kind: 'holiday', name, source: SOURCE_2026 });
});
Object.entries(TRANSFERRED_OFF_2026).forEach(([date, name]) => {
  overrides.set(date, { kind: 'transferred_off', name, source: SOURCE_2026 });
});
SHORTENED_2026.forEach((date) => {
  overrides.set(date, { kind: 'shortened', name: 'Сокращённый день', source: 'ст. 95 ТК РФ' });
});
Object.entries(HOLIDAYS_2027).forEach(([date, name]) => {
  overrides.set(date, { kind: 'holiday', name, source: SOURCE_2027 });
});
Object.entries(TRANSFERRED_OFF_2027).forEach(([date, name]) => {
  overrides.set(date, { kind: 'transferred_off', name, source: SOURCE_2027 });
});
Object.entries(WORKING_SATURDAYS_2027).forEach(([date, name]) => {
  overrides.set(date, { kind: 'working_saturday', name, hours: 7, source: SOURCE_2027 });
});
SHORTENED_2027.forEach((date) => {
  overrides.set(date, { kind: 'shortened', name: 'Сокращённый день', source: 'ст. 95 ТК РФ' });
});

/** Настроен ли производственный календарь на этот год. */
export function isCalendarYearSupported(year: number) {
  return CALENDAR_YEARS.has(year);
}

function dateKey(value: string | Date | Dayjs) {
  return dayjs(value).format('YYYY-MM-DD');
}

function isWeekendDate(value: string | Date | Dayjs) {
  const day = dayjs(value).day();
  return day === 0 || day === 6;
}

export function getCalendarDay(value: string | Date | Dayjs): CalendarDay {
  const date = dateKey(value);
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return { date, kind: 'workday', hours: 8 };
  }

  const override = overrides.get(date);
  if (override) {
    return {
      date,
      kind: override.kind,
      hours:
        override.hours ??
        (override.kind === 'shortened' ? 7 : override.kind === 'working_saturday' ? 8 : 0),
      name: override.name,
      source: override.source,
    };
  }

  if (isWeekendDate(parsed)) {
    return { date, kind: 'weekend', hours: 0 };
  }

  return { date, kind: 'workday', hours: 8 };
}

export function isWorkingDay(value: string | Date | Dayjs) {
  const kind = getCalendarDay(value).kind;
  return kind === 'workday' || kind === 'shortened' || kind === 'working_saturday';
}

/** Праздник или перенесённый выходной — такие дни в календаре красные. */
export function isRedDay(value: string | Date | Dayjs) {
  const kind = getCalendarDay(value).kind;
  return kind === 'holiday' || kind === 'transferred_off';
}

/** Строго нерабочий праздничный день (без переносов). */
function isHoliday(value: string | Date | Dayjs) {
  return getCalendarDay(value).kind === 'holiday';
}

export function getDayHours(value: string | Date | Dayjs, hoursPerWeek = 40) {
  const day = getCalendarDay(value);
  if (!isWorkingDay(value)) return 0;
  const base = hoursPerWeek / 5;
  if (day.kind === 'shortened') return Math.max(0, base - 1);
  // Рабочая суббота может быть сокращённой (20.02.2027 — 7 часов).
  if (day.kind === 'working_saturday') return Math.min(day.hours || base, base);
  return base;
}

function datesOfCalendarMonth(month: string) {
  const start = dayjs(`${month}-01`);
  const count = start.daysInMonth();
  return Array.from({ length: count }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'));
}

function getMonthCalendar(month: string) {
  return datesOfCalendarMonth(month).map((date) => getCalendarDay(date));
}

export function normDaysOfMonth(month: string) {
  return getMonthCalendar(month).filter((day) => day.kind === 'workday' || day.kind === 'shortened' || day.kind === 'working_saturday').length;
}

export function normHoursOfMonth(month: string, hoursPerWeek = 40) {
  const total = getMonthCalendar(month).reduce(
    (sum, day) => sum + getDayHours(day.date, hoursPerWeek),
    0,
  );
  return Math.round(total * 10) / 10;
}

export function workingDaysBetween(start: string, end: string) {
  let from = dayjs(start).startOf('day');
  const to = dayjs(end).startOf('day');
  if (!from.isValid() || !to.isValid() || from.isAfter(to)) return 0;
  let count = 0;
  while (from.isBefore(to) || from.isSame(to)) {
    if (isWorkingDay(from)) count += 1;
    from = from.add(1, 'day');
  }
  return count;
}

export function calendarDaysBetween(start: string, end: string) {
  let from = dayjs(start).startOf('day');
  const to = dayjs(end).startOf('day');
  if (!from.isValid() || !to.isValid() || from.isAfter(to)) return 0;
  let count = 0;
  while (from.isBefore(to) || from.isSame(to)) {
    count += 1;
    from = from.add(1, 'day');
  }
  return count;
}

/** Число нерабочих праздничных дней в периоде (без перенесённых выходных). */
export function holidayDaysBetween(start: string, end: string) {
  let from = dayjs(start).startOf('day');
  const to = dayjs(end).startOf('day');
  if (!from.isValid() || !to.isValid() || from.isAfter(to)) return 0;
  let count = 0;
  while (from.isBefore(to) || from.isSame(to)) {
    if (isHoliday(from)) count += 1;
    from = from.add(1, 'day');
  }
  return count;
}

export function nextWorkingDay(value: string | Date | Dayjs) {
  let date = dayjs(value).startOf('day').add(1, 'day');
  let guard = 0;
  while (!isWorkingDay(date) && guard < 370) {
    date = date.add(1, 'day');
    guard += 1;
  }
  return date.format('YYYY-MM-DD');
}
