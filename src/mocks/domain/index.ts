/**
 * Доменный слой мок-бэкенда: правила без MSW, Axios и localStorage.
 *
 * Это исполняемая спецификация для будущего FastAPI:
 * - `handlers/*` — аналог `app/api/v1/*`;
 * - `domain/*` — аналог `app/services/*`;
 * - `RuleResult` — будущий `HTTPException` (400/403/404).
 */
export * from './result';
export * from './ids';
export * from './fields';
export * from './positions';
export * from './promotion';
export * from './audit';
export * from './notifications';
export * from './scoping';
export * from './access';
export * from './vacations';
export * from './workload';
export * from './departments';
export * from './employees';
export * from './lifecycle';
export * from './absences';
export * from './dashboard';
