import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/primitives';

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : 'Неизвестная ошибка';

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <Card className="w-full max-w-lg p-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-fg">
          Что-то пошло не так
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Интерфейс не смог загрузить часть данных. Обновите страницу — обычно этого
          достаточно. Если ошибка повторяется, сообщите администратору.
        </p>
        {import.meta.env.DEV ? (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11px] leading-5 text-muted">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw /> Обновить страницу
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            На главную
          </Button>
        </div>
      </Card>
    </div>
  );
}
