import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import { cn, formatDateTime } from '@/shared/lib/utils';
import { useToast } from '@/shared/ui/toast';

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => api.notifications.list(unreadOnly ? { unread: true } : {}),
    refetchInterval: 60000,
  });
  const items = query.data ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const readMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: invalidate,
    onError: (error) => toast.error('Не удалось отметить уведомление', getErrorMessage(error)),
  });

  const readAllMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: invalidate,
    onError: (error) => toast.error('Не удалось отметить уведомления', getErrorMessage(error)),
  });

  const openItem = (id: string, link?: string) => {
    readMutation.mutate(id, {
      onSuccess: () => {
        setOpen(false);
        if (link) navigate(link);
      },
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-fg transition hover:bg-surface-2"
        title="Уведомления"
        aria-label={unread > 0 ? `Уведомления, непрочитанных ${unread}` : 'Уведомления'}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-2rem)] border border-border bg-surface shadow-none">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div>
              <p className="text-[13px] font-semibold text-fg">Уведомления</p>
              <p className="text-[10px] text-muted">
                {unread > 0 ? `${unread} непрочитанных` : 'Всё прочитано'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUnreadOnly((value) => !value)}
                className={cn(
                  'px-1.5 py-0.5 text-[10px] transition',
                  unreadOnly ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {unreadOnly ? 'Только новые' : 'Все'}
              </button>
              <button
                type="button"
                title="Прочитать все"
                aria-label="Прочитать все уведомления"
                disabled={unread === 0 || readAllMutation.isPending}
                onClick={() => readAllMutation.mutate()}
                className="inline-flex size-7 items-center justify-center text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-40"
              >
                <CheckCheck className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {query.isLoading ? (
              <p className="px-3 py-4 text-xs text-muted">Загружаем…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted">
                {unreadOnly ? 'Непрочитанных нет' : 'Уведомлений пока нет'}
              </p>
            ) : (
              items.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item.id, item.link)}
                  className={cn(
                    'flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left transition last:border-b-0 hover:bg-surface-2/50',
                    !item.readAt && 'bg-surface-2/30',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0',
                      item.readAt ? 'bg-transparent' : 'bg-danger',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-fg">{item.title}</span>
                    {item.body ? (
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted">
                        {item.body}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[10px] text-muted">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
