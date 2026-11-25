import type { Employee, Position } from '@/shared/types';
import { positionDepartmentProblem } from './positions';
import { fail, ok, type RuleResult } from './result';

export interface PromotionInput {
  employee: Employee;
  positions: Position[];
  toPositionId?: string | null;
  newSalary?: number | null;
  canWriteSalary: boolean;
}

export interface PromotionDecision {
  position: Position;
  salary: number;
}

/**
 * Правила повышения: только своё подразделение, своя профессиональная ветка
 * и более высокий грейд. HR получает нижнюю границу вилки, admin может
 * выбрать оклад в пределах вилки.
 */
export function validatePromotion(input: PromotionInput): RuleResult<PromotionDecision> {
  if (!input.toPositionId) return fail(400, 'Выберите новую должность');

  const position = input.positions.find((item) => item.id === input.toPositionId);
  if (!position) return fail(400, 'Должность не найдена');
  if (position.id === input.employee.positionId) {
    return fail(400, 'Новая должность должна отличаться от текущей');
  }
  if (position.departmentId !== input.employee.departmentId) {
    return fail(400, 'Повышение возможно только в своём подразделении');
  }

  const current = input.positions.find((item) => item.id === input.employee.positionId);
  if (current && position.family !== current.family) {
    return fail(400, 'Повышение возможно только в своей профессиональной ветке');
  }
  if (current && position.grade <= current.grade) {
    return fail(400, 'Новая должность должна быть выше по грейду');
  }

  const salary = input.canWriteSalary
    ? (input.newSalary ?? position.salaryMin)
    : position.salaryMin;
  if (!Number.isFinite(salary) || salary < 0) {
    return fail(400, 'Некорректный размер оклада');
  }
  if (salary < position.salaryMin || salary > position.salaryMax) {
    return fail(400, 'Оклад выходит за вилку должности');
  }

  return ok({ position, salary });
}

export interface TransferInput {
  employee: Employee;
  positions: Position[];
  toDepartmentId?: string | null;
  toPositionId?: string | null;
}

export interface TransferDecision {
  toDepartmentId: string;
  toPositionId?: string | null;
}

/**
 * Правила перевода: при смене подразделения должность обязательна и должна
 * принадлежать новому подразделению. Перевод внутри подразделения может
 * менять только должность.
 */
export function validateTransfer(input: TransferInput): RuleResult<TransferDecision> {
  const toDepartmentId = input.toDepartmentId ?? input.employee.departmentId;

  if (input.toPositionId) {
    const problem = positionDepartmentProblem(
      input.positions,
      toDepartmentId,
      input.toPositionId,
    );
    if (problem) return fail(400, problem);
  } else if (input.toDepartmentId && input.toDepartmentId !== input.employee.departmentId) {
    return fail(400, 'Для перевода в другое подразделение выберите должность');
  }

  return ok({ toDepartmentId, toPositionId: input.toPositionId ?? null });
}
