import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { Button } from '@/shared/ui/button';
import { Card, EmptyState } from '@/shared/ui/primitives';

export function NotFoundPage() {
  const user = useAuthStore((state) => state.user);
  const home = !user ? '/login' : user.role === 'employee' ? '/me' : '/';

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <EmptyState
          title="Страница не найдена"
          description="Возможно, адрес указан неверно или раздел был перемещён."
          icon={Compass}
          action={
            <Link to={home}>
              <Button>
                <Home /> На главную
              </Button>
            </Link>
          }
        />
        <p className="border-t border-border px-5 py-3 text-center text-[11px] text-muted">
          Код ошибки: 404
        </p>
      </Card>
    </div>
  );
}
