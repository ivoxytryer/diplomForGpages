import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  RefreshCcw,
  Search,
  Sun,
  UserRound,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { roleLabels } from '@/shared/lib/meta';
import { useAuthStore, useThemeStore } from '@/features/auth/auth-store';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Avatar } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

export function Topbar({
  onOpenMenu,
  onOpenSearch,
}: {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  const handleReset = async () => {
    if (!window.confirm('Сбросить демо-данные и вернуть исходное состояние?')) return;
    setResetting(true);
    try {
      await api.demo.reset();
      queryClient.clear();
      window.location.reload();
    } catch (error) {
      toast.error('Не удалось сбросить данные', getErrorMessage(error));
    } finally {
      setResetting(false);
    }
  };

  const nameParts = (user?.name ?? '').split(' ');

  return (
    <header className="app-topbar no-print sticky top-0 z-30 flex h-14 items-center gap-3 bg-bg px-4 lg:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMenu} aria-label="Открыть меню">
        <Menu />
      </Button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-border bg-surface px-2.5 text-left text-[12px] text-muted transition-colors hover:border-fg hover:text-fg sm:max-w-md"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="truncate">Поиск сотрудников и разделов…</span>
        <kbd className="ml-auto hidden shrink-0 border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
          title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
        >
          {theme === 'light' ? <Moon /> : <Sun />}
        </Button>
        {user && user.role !== 'employee' ? (
          <Link
            to="/events"
            className="relative inline-flex size-9 items-center justify-center rounded-lg text-fg transition hover:bg-surface-2"
            title="Кадровые события"
            aria-label="Кадровые события"
          >
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger" />
          </Link>
        ) : null}

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="flex items-center gap-2 border border-transparent px-1.5 py-1 transition-colors hover:border-border hover:bg-surface"
          >
            <Avatar lastName={nameParts[0]} firstName={nameParts[1] ?? ''} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[130px] truncate text-xs font-semibold text-fg">
                {user?.name}
              </span>
              <span className="block text-[10px] text-muted">
                {user ? roleLabels[user.role] : ''}
              </span>
            </span>
            <ChevronDown className={cn('size-3.5 text-muted transition', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-full z-50 mt-1 w-64 animate-pop overflow-hidden border border-border bg-surface">
              <div className="border-b border-border px-3 py-2.5">
                <p className="text-[13px] font-semibold text-fg">{user?.name}</p>
                <p className="truncate text-[11px] text-muted">{user?.email}</p>
                <span className="mt-1 inline-flex bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {user ? roleLabels[user.role] : ''}
                </span>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/me');
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-fg transition-colors hover:bg-surface-2"
                >
                  <UserRound className="size-3.5 text-muted" />
                  Моя карточка
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/change-password');
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-fg transition-colors hover:bg-surface-2"
                >
                  <KeyRound className="size-3.5 text-muted" />
                  Сменить пароль
                </button>
                {import.meta.env.VITE_USE_MOCKS !== 'false' && user?.role === 'admin' ? (
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    <RefreshCcw className={cn('size-3.5 text-muted', resetting && 'animate-spin')} />
                    Сбросить демо-данные
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] text-fg transition-colors hover:bg-surface-2"
                >
                  <LogOut className="size-3.5 text-muted" />
                  Выйти
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
