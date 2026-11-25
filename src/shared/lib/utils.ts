import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

dayjs.locale('ru');

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type DateInput = string | Date | Dayjs;

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return dayjs(value).format('DD.MM.YYYY');
}

/** Подпись сотрудника в select: ФИО — подразделение. */
export function employeeOptionLabel(name: string, departmentName?: string | null) {
  return departmentName ? `${name} — ${departmentName}` : name;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return dayjs(value).format('DD.MM.YYYY HH:mm');
}

/** Реальная дата в формате YYYY-MM-DD (30 февраля не проходит). */
export function isValidDateString(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayjs(value).format('YYYY-MM-DD') === value;
}

export function formatMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

export function monthKey(value: DateInput = new Date()) {
  return dayjs(value).format('YYYY-MM');
}

export function monthLabel(value: DateInput = new Date()) {
  return dayjs(value).format('MMMM YYYY');
}

export function monthShortLabel(value: DateInput) {
  return dayjs(value).format('MMM YY');
}

export function todayISO() {
  return dayjs().format('YYYY-MM-DD');
}

export function datesOfMonth(month: string) {
  const start = dayjs(`${month}-01`);
  const count = start.daysInMonth();
  return Array.from({ length: count }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'));
}

export function getInitials(lastName: string, firstName: string, middleName?: string) {
  const parts = [lastName, firstName, middleName].filter(Boolean) as string[];
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function fullName(
  employee: { lastName: string; firstName: string; middleName?: string } | null | undefined,
) {
  if (!employee) return '—';
  return [employee.lastName, employee.firstName, employee.middleName].filter(Boolean).join(' ');
}

export function shortName(
  employee: { lastName: string; firstName: string; middleName?: string } | null | undefined,
) {
  if (!employee) return '—';
  return `${employee.lastName} ${employee.firstName.charAt(0)}.${employee.middleName ? `${employee.middleName.charAt(0)}.` : ''}`;
}

function age(birthDate: string) {
  return dayjs().diff(dayjs(birthDate), 'year');
}

export function plural(count: number, forms: [string, string, string]) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

export function ageLabel(birthDate: string) {
  return `${age(birthDate)} ${plural(age(birthDate), ['год', 'года', 'лет'])}`;
}
