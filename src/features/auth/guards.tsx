import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import { useAuthStore } from './auth-store';
import type { Role } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/primitives';

export function RequireAuth() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const location = useLocation();

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: api.auth.me,
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);

  // Ошибку 401 обрабатывает интерцептор API: он чистит сессию и уводит на логин.
  // Сетевой сбой или временная недоступность мок-API не должны разлогинивать:
  // иначе после сворачивания вкладки пользователя выбрасывает на логин.
  if (!token) return <Navigate to="/login" replace />;
  if (!user && me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!user) {
    if (me.isError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg p-6">
          <div className="w-full max-w-md border border-border bg-surface p-6 text-fg">
            <h1 className="text-lg font-semibold">Не удалось проверить сессию</h1>
            <p className="mt-2 text-sm text-muted">{getErrorMessage(me.error)}</p>
            <p className="mt-2 text-xs text-muted">
              Сессия сохранена. Проверьте соединение и попробуйте ещё раз.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => me.refetch()} loading={me.isFetching}>
                Повторить
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Обновить страницу
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    return (
      <Navigate
        to={user.role === 'employee' ? '/me' : '/forbidden'}
        replace
        state={{ from: location }}
      />
    );
  }
  return <>{children}</>;
}
