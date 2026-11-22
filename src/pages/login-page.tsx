import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Loader2, Moon, Sun } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import { useAuthStore, useThemeStore } from '@/features/auth/auth-store';
import { roleLabels } from '@/shared/lib/meta';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/primitives';
import type { Role } from '@/shared/types';

const demoPassword = 'demo1234';

const demoAccounts: { email: string; role: Role; name: string }[] = [
  { email: 'admin@hr.local', role: 'admin', name: 'Павел Соколов' },
  { email: 'hr@hr.local', role: 'hr', name: 'Мария Смирнова' },
  { email: 'manager@hr.local', role: 'manager', name: 'Дмитрий Кузнецов' },
  { email: 'employee@hr.local', role: 'employee', name: 'Анна Попова' },
];

export function LoginPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (token) {
    const home = user?.role === 'employee' ? '/me' : '/';
    return <Navigate to={user?.mustChangePassword ? '/change-password' : home} replace />;
  }

  const loading = pending !== null;

  const signIn = async (credentials: { email: string; password: string }, source: string) => {
    setError('');
    setPending(source);
    setEmail(credentials.email);
    setPassword(credentials.password);
    try {
      const response = await api.auth.login(credentials);
      login(response.user, response.token);
      navigate(
        response.user.mustChangePassword
          ? '/change-password'
          : response.user.role === 'employee'
            ? '/me'
            : '/',
        { replace: true },
      );
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setPending(null);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void signIn({ email, password }, 'form');
  };

  return (
    <div className="login-screen min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col px-5 py-6 sm:py-8">
        <header className="flex items-center gap-3 border-b border-border pb-5">
          <span className="flex size-9 shrink-0 items-center justify-center border border-fg bg-fg text-bg">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight">Кадровый учёт</p>
            <p className="text-[10px] text-muted">HR-платформа организации</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto border border-border"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </Button>
        </header>

        <main className="flex flex-1 flex-col justify-center py-8">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">Вход</h1>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            Учётные данные или быстрый вход по роли
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={loading}>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.ru"
                autoComplete="username"
                required
                disabled={loading}
                className="placeholder:text-muted"
              />
            </Field>
            <Field label="Пароль">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
                className="placeholder:text-muted"
              />
            </Field>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={pending === 'form'} disabled={loading}>
              Войти
              {pending === 'form' ? null : <ArrowRight />}
            </Button>
          </form>

          <div className="my-7 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted">
              Быстрый вход
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Быстрый вход по роли" aria-busy={loading}>
            {demoAccounts.map((account) => {
              const isPending = pending === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => void signIn({ email: account.email, password: demoPassword }, account.email)}
                  disabled={loading}
                  title={`${account.email} · ${demoPassword}`}
                  aria-label={`Войти как ${roleLabels[account.role]} — ${account.name}`}
                  className="flex min-h-[54px] flex-col justify-center border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fg disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-fg">{roleLabels[account.role]}</span>
                    {isPending ? <Loader2 className="size-3.5 animate-spin text-primary" /> : null}
                  </span>
                  <span className="mt-0.5 truncate text-[11px] text-muted">{account.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">
            Пароль демо-аккаунтов — <span className="tabular-nums">demo1234</span>
          </p>
        </main>

        <footer className="flex items-center justify-between gap-3 text-[11px] text-muted">
          <span>© {new Date().getFullYear()} HR System</span>
          <span>демо-сборка</span>
        </footer>
      </div>
    </div>
  );
}
