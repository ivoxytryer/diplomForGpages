import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Briefcase,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Network,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import type { Role } from '@/shared/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Обзор',
    items: [
      { to: '/', label: 'Дашборд', icon: LayoutDashboard, roles: ['admin', 'hr', 'manager'], end: true },
      { to: '/me', label: 'Моя карточка', icon: UserRound, roles: ['employee'] },
    ],
  },
  {
    title: 'Персонал',
    items: [
      { to: '/employees', label: 'Сотрудники', icon: Users, roles: ['admin', 'hr', 'manager'] },
    ],
  },
  {
    title: 'Организация',
    items: [
      { to: '/directory/departments', label: 'Подразделения', icon: Network, roles: ['admin', 'hr'] },
      { to: '/directory/positions', label: 'Должности', icon: Briefcase, roles: ['admin', 'hr'] },
      { to: '/projects', label: 'Проекты', icon: FolderKanban, roles: ['admin', 'hr', 'manager'] },
      { to: '/tasks', label: 'Задачи', icon: ListTodo, roles: ['admin', 'hr', 'manager', 'employee'] },
    ],
  },
  {
    title: 'Учёт времени',
    items: [
      { to: '/timesheet', label: 'Табель', icon: ClipboardList, roles: ['admin', 'hr', 'manager', 'employee'] },
      { to: '/absences', label: 'Отсутствия', icon: CalendarDays, roles: ['admin', 'hr', 'manager', 'employee'] },
      { to: '/workload', label: 'Загрузка', icon: Activity, roles: ['admin', 'hr', 'manager', 'employee'] },
      { to: '/events', label: 'Кадровые события', icon: Clock3, roles: ['admin', 'hr', 'manager'] },
    ],
  },
  {
    title: 'Аналитика',
    items: [
      { to: '/reports', label: 'Отчёты', icon: ChartNoAxesCombined, roles: ['admin', 'hr', 'manager'] },
    ],
  },
  {
    title: 'Администрирование',
    items: [
      { to: '/admin/users', label: 'Пользователи', icon: ShieldCheck, roles: ['admin'] },
      { to: '/admin/audit', label: 'Журнал действий', icon: ClipboardList, roles: ['admin'] },
    ],
  },
];

export function navForRole(role: Role) {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}
