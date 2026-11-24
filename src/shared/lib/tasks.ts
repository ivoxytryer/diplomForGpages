import dayjs from 'dayjs';
import type { ProjectTask } from '@/shared/types';
import { nextWorkingDay } from './calendar';
import { todayISO } from './utils';

export { nextWorkingDay };

/**
 * Новая плановая дата задачи при переносе.
 * Если задача уже просрочена — отсчёт идёт от сегодняшнего дня,
 * иначе — от текущей плановой даты.
 */
export function postponeTaskDate(dueDate: string, today: string = todayISO()) {
  const base = dayjs(dueDate).isAfter(dayjs(today), 'day') ? dueDate : today;
  return nextWorkingDay(base);
}

export function isTaskOverdue(task: ProjectTask, today: string = todayISO()) {
  return task.status === 'todo' && task.dueDate < today;
}

export function isTaskDueToday(task: ProjectTask, today: string = todayISO()) {
  return task.status === 'todo' && task.dueDate === today;
}

function compareTasks(a: ProjectTask, b: ProjectTask) {
  if (a.status !== b.status) return a.status === 'todo' ? -1 : 1;
  if (a.dueDate !== b.dueDate) return String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''));
  return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
}

export function sortTasks(tasks: ProjectTask[]) {
  return [...tasks].sort(compareTasks);
}
