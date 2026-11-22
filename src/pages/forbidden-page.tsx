import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { roleLabels } from '@/shared/lib/meta';
import { Button } from '@/shared/ui/button';
import { Card, EmptyState } from '@/shared/ui/primitives';

export function ForbiddenPage() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const home = !user ? '/login' : user.role === 'employee' ? '/me' : '/';
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <EmptyState
          title="Недостаточно прав"
          description={
            user
              ? `Раздел недоступен для роли «${roleLabels[user.role]}». Если доступ необходим, обратитесь к администратору.`
              : 'Для просмотра раздела требуется авторизация.'
          }
          icon={ShieldAlert}
          action={
            <Link to={home}>
              <Button>Вернуться на главную</Button>
            </Link>
          }
        />
        <div className="space-y-1 border-t border-border px-5 py-3 text-center text-[11px] text-muted">
          <p>Код ошибки: 403</p>
          {from ? <p className="font-mono">{from}</p> : null}
        </div>
      </Card>
    </div>
  );
}
