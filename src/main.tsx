import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { Providers } from '@/app/providers';
import { applyTheme } from '@/features/auth/auth-store';
import '@/styles/index.css';

async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS === 'false') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/mockServiceWorker.js' },
    quiet: true,
  });
}

applyTheme();

const root = createRoot(document.getElementById('root')!);

enableMocking()
  .catch((error) => {
    console.error('Не удалось запустить мок-сервер', error);
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>,
    );
  });
