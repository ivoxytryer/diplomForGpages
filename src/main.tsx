import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { Providers } from '@/app/providers';
import { MockErrorScreen } from '@/app/mock-error-screen';
import { applyTheme } from '@/features/auth/auth-store';
import '@/styles/index.css';

const RELOAD_KEY = 'hr-mock-boot-reload';

async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS === 'false') return;
  if (!('serviceWorker' in navigator)) {
    throw new Error('Браузер не поддерживает service workers');
  }

  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    quiet: true,
  });

  // Первый запуск: воркер может быть зарегистрирован, но ещё не управлять
  // страницей. В этом случае запросы уходят в сеть и логин получает 405.
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 2000);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  if (!navigator.serviceWorker.controller) {
    // Один автоматический перезапуск — после него воркер обычно уже активен.
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
      return new Promise<void>(() => {});
    }
    throw new Error('Service worker не управляет страницей');
  }

  sessionStorage.removeItem(RELOAD_KEY);
}

applyTheme();

const root = createRoot(document.getElementById('root')!);

function renderApp() {
  root.render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}

enableMocking()
  .then(renderApp)
  .catch((error) => {
    console.error('Не удалось запустить мок-сервер', error);
    root.render(
      <StrictMode>
        <MockErrorScreen error={error} />
      </StrictMode>,
    );
  });
