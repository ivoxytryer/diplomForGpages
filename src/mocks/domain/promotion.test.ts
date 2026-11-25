import { describe, expect, it } from 'vitest';
import type { Employee, Position } from '@/shared/types';
import { validatePromotion, validateTransfer } from './promotion';

const employee: Employee = {
  id: 'e1',
  personnelNumber: '0001',
  lastName: 'Иванов',
  firstName: 'Пётр',
  birthDate: '1990-01-01',
  gender: 'male',
  email: 'p.ivanov@hr.local',
  phone: '+7 900 000-00-01',
  departmentId: 'd1',
  positionId: 'p2',
  hireDate: '2020-01-01',
  status: 'active',
  employmentType: 'full',
  salary: 120_000,
};

const positions: Position[] = [
  {
    id: 'p2',
    name: 'Разработчик',
    departmentId: 'd1',
    family: 'Backend',
    grade: 2,
    salaryMin: 100_000,
    salaryMax: 160_000,
  },
  {
    id: 'p3',
    name: 'Старший разработчик',
    departmentId: 'd1',
    family: 'Backend',
    grade: 3,
    salaryMin: 150_000,
    salaryMax: 220_000,
  },
  {
    id: 'p4',
    name: 'Аналитик',
    departmentId: 'd1',
    family: 'Analytics',
    grade: 3,
    salaryMin: 140_000,
    salaryMax: 210_000,
  },
  {
    id: 'p5',
    name: 'Ведущий разработчик',
    departmentId: 'd2',
    family: 'Backend',
    grade: 4,
    salaryMin: 200_000,
    salaryMax: 300_000,
  },
];

describe('validatePromotion', () => {
  it('разрешает повышение внутри ветки и подразделения', () => {
    const result = validatePromotion({
      employee,
      positions,
      toPositionId: 'p3',
      newSalary: 180_000,
      canWriteSalary: true,
    });

    expect(result).toEqual({
      ok: true,
      value: { position: positions[1], salary: 180_000 },
    });
  });

  it('ставит HR нижнюю границу вилки и игнорирует переданный оклад', () => {
    const result = validatePromotion({
      employee,
      positions,
      toPositionId: 'p3',
      newSalary: 210_000,
      canWriteSalary: false,
    });

    expect(result).toEqual({
      ok: true,
      value: { position: positions[1], salary: 150_000 },
    });
  });

  it('запрещает повышение в другую профессиональную ветку', () => {
    const result = validatePromotion({
      employee,
      positions,
      toPositionId: 'p4',
      canWriteSalary: true,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        status: 400,
        message: 'Повышение возможно только в своей профессиональной ветке',
      },
    });
  });

  it('запрещает повышение в другое подразделение', () => {
    const result = validatePromotion({
      employee,
      positions,
      toPositionId: 'p5',
      canWriteSalary: true,
    });

    expect(result).toEqual({
      ok: false,
      error: { status: 400, message: 'Повышение возможно только в своём подразделении' },
    });
  });

  it('запрещает оклад вне вилки должности', () => {
    const result = validatePromotion({
      employee,
      positions,
      toPositionId: 'p3',
      newSalary: 250_000,
      canWriteSalary: true,
    });

    expect(result).toEqual({
      ok: false,
      error: { status: 400, message: 'Оклад выходит за вилку должности' },
    });
  });
});

describe('validateTransfer', () => {
  it('требует должность при переводе в другое подразделение', () => {
    const result = validateTransfer({
      employee,
      positions,
      toDepartmentId: 'd2',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        status: 400,
        message: 'Для перевода в другое подразделение выберите должность',
      },
    });
  });

  it('не разрешает должность из другого подразделения', () => {
    const result = validateTransfer({
      employee,
      positions,
      toDepartmentId: 'd2',
      toPositionId: 'p3',
    });

    expect(result).toEqual({
      ok: false,
      error: { status: 400, message: 'Должность относится к другому подразделению' },
    });
  });

  it('разрешает перевод внутри подразделения без смены должности', () => {
    const result = validateTransfer({
      employee,
      positions,
      toDepartmentId: 'd1',
    });

    expect(result).toEqual({ ok: true, value: { toDepartmentId: 'd1', toPositionId: null } });
  });
});
