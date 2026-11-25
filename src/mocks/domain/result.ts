/**
 * Результат доменной проверки. Домен не знает про HTTP, MSW и localStorage:
 * он возвращает либо значение, либо ошибку с будущим HTTP-статусом.
 * Это позволяет тестировать правила отдельно и переносить их в FastAPI
 * как исполняемую спецификацию.
 */
export interface RuleError {
  status: 400 | 403 | 404;
  message: string;
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: RuleError };

export function ok<T>(value: T): RuleResult<T> {
  return { ok: true, value };
}

export function fail(status: RuleError['status'], message: string): RuleResult<never> {
  return { ok: false, error: { status, message } };
}
