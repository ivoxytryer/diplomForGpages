import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '@/shared/api';
import { useAuthStore } from './auth-store';
import type { Role } from '@/shared/types';
import { Spinner } from '@/shared/ui/primitives';

export function RequireAuth() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: api.auth.me,
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (me.data) setUser(me.data);
  }, [me.data, setUser]);

  useEffect(() => {
    if (me.isError) logout();
  }, [me.isError, logout]);

  if (!token) return <Navigate to="/login" replace />;
  if (!user && me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

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
