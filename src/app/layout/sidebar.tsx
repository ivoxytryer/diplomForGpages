import { NavLink } from 'react-router-dom';
import { Building2, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { roleLabels } from '@/shared/lib/meta';
import { useAuthStore } from '@/features/auth/auth-store';
import { navForRole } from '@/app/navigation';
import { Button } from '@/shared/ui/button';
import { Avatar } from '@/shared/ui/primitives';

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const sections = user ? navForRole(user.role) : [];

  return (
    <aside
      className={cn(
        'no-print fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col bg-surface transition-[width] duration-150',
        collapsed ? 'lg:w-[64px]' : 'lg:w-[232px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span className="flex size-7 shrink-0 items-center justify-center border border-fg bg-fg text-bg">
          <Building2 className="size-4" />
        </span>
        <div className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <p className="truncate text-[12px] font-semibold leading-tight text-fg">Кадровый учёт</p>
          <p className="truncate text-[10px] text-muted">HR-платформа</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onCloseMobile}
          aria-label="Закрыть меню"
        >
          <X />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p
              className={cn(
                'mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted',
                collapsed && 'lg:hidden',
              )}
            >
              {section.title}
            </p>
            <div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 border-l-2 px-2 py-1.5 text-[12px] font-medium transition-colors',
                        isActive
                          ? 'border-fg bg-surface-2 text-fg'
                          : 'border-transparent text-muted hover:bg-surface-2/60 hover:text-fg',
                        collapsed && 'lg:justify-center lg:px-0',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        {!collapsed ? (
          <div className="mb-2 border border-border px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg">Демо-режим</p>
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">MSW</span>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted">
              Данные в браузере. Бэкенд: VITE_USE_MOCKS=false.
            </p>
          </div>
        ) : null}
        <div className={cn('flex items-center gap-2', collapsed && 'lg:flex-col')}>
          {user ? (
            <div className={cn('flex min-w-0 flex-1 items-center gap-2', collapsed && 'lg:flex-none')}>
              <Avatar
                lastName={(user.name ?? '').split(' ')[0] ?? ''}
                firstName={(user.name ?? '').split(' ')[1] ?? ''}
                size="xs"
              />
              <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
                <p className="truncate text-[11px] font-medium text-fg">{user.name}</p>
                <p className="truncate text-[10px] text-muted">{roleLabels[user.role]}</p>
              </div>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            className="hidden lg:inline-flex"
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
