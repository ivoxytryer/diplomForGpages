import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/shared/ui/toast';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Service worker MSW может «заснуть» вместе с вкладкой. Короткий
            // сетевой сбой не должен оставлять экран пустым: делаем несколько
            // повторов и перезапрашиваем данные при возврате к вкладке/сети.
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
