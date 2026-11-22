import { useState } from 'react';
import { ArrowRight, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';
import { Button } from '@/shared/ui/button';
import { Card, Field, Input } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

export function ChangePasswordPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const mustChange = Boolean(user?.mustChangePassword);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Новый пароль должен содержать не менее 8 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const updated = await api.auth.changePassword({ currentPassword, newPassword });
      setUser(updated);
      toast.success('Пароль изменён');
      navigate(updated.role === 'employee' ? '/me' : '/', { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-5 sm:p-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center border border-fg bg-fg text-bg">
            <Building2 className="size-5" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-fg">Кадровый учёт</p>
            <p className="text-[10px] text-muted">Безопасность учётной записи</p>
          </div>
        </div>

        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3 border-b border-border pb-4">
            <span className="flex size-8 shrink-0 items-center justify-center border border-border text-fg">
              <KeyRound className="size-4" />
            </span>
            <div>
              <h1 className="text-[17px] font-semibold text-fg">
                {mustChange ? 'Смените временный пароль' : 'Смена пароля'}
              </h1>
              <p className="mt-1 text-xs text-muted">
                {mustChange
                  ? 'Это первый вход. Придумайте постоянный пароль — временный пароль больше действовать не будет.'
                  : 'Введите текущий пароль и придумайте новый.'}
              </p>
            </div>
          </div>

          {mustChange ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>Пока пароль не изменён, остальные разделы системы недоступны.</p>
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            <Field label="Текущий пароль">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Новый пароль" hint="Не менее 8 символов">
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Повторите новый пароль">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>

            {error ? (
              <div className="rounded-lg border border-danger/30 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Сохранить новый пароль
              <ArrowRight />
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11px] text-muted">
          Пароль хранится только в виде хеша. После смены временный пароль перестаёт работать.
        </p>
      </div>
    </div>
  );
}
