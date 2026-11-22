import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/features/auth/auth-store';

class ApiError extends Error {
  status?: number;
  fields?: Record<string, string>;

  constructor(message: string, status?: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: unknown; fields?: Record<string, string> }>) => {
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        useAuthStore.getState().logout();
        if (!window.location.pathname.startsWith(`${import.meta.env.BASE_URL}login`)) {
          window.location.assign(`${import.meta.env.BASE_URL}login`);
        }
      }
    }

    let message = 'Не удалось выполнить запрос';
    if (typeof data?.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      message = 'Проверьте заполнение формы';
    } else if (error.message) {
      message = error.message;
    }

    return Promise.reject(new ApiError(message, status, data?.fields));
  },
);

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Неизвестная ошибка';
}
