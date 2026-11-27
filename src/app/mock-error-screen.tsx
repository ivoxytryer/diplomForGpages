import { Button } from '@/shared/ui/button';

/**
 * Показывается, если не удалось запустить MSW/service worker.
 * Без него запросы уходят в статический хостинг и логин получает 405.
 */
export function MockErrorScreen({ error }: { error: unknown }) {
  const detail = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-fg">
      <div className="w-full max-w-md border border-border bg-surface-2 p-6">
        <h1 className="text-lg font-semibold">Демо-среда не загрузилась</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Сервис-воркер, который отвечает за демо-API, не запустился. Поэтому запросы
          уходят на статический хостинг и получают ошибку.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          Обычно помогает обновить страницу. Если не помогло — проверьте, что в браузере
          не отключены service workers и не включён режим, блокирующий хранилище сайта.
        </p>
        <p className="mt-3 break-words border border-border bg-surface p-2 font-mono text-[10px] text-muted">
          {detail}
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Обновить страницу
        </Button>
      </div>
    </div>
  );
}
