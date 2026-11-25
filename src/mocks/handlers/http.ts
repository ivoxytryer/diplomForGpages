import { HttpResponse } from 'msw';
import type { RuleError } from '../domain/result';

export function notFound(detail = 'Запись не найдена') {
  return HttpResponse.json({ detail }, { status: 404 });
}

export function badRequest(detail: string) {
  return HttpResponse.json({ detail }, { status: 400 });
}

export function unauthorized(detail = 'Требуется авторизация') {
  return HttpResponse.json({ detail }, { status: 401 });
}

export function forbidden(detail = 'Недостаточно прав') {
  return HttpResponse.json({ detail }, { status: 403 });
}

export function ruleResponse(error: RuleError) {
  return HttpResponse.json({ detail: error.message }, { status: error.status });
}
