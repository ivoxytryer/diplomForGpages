import { describe, expect, it } from 'vitest';
import { calculatePayroll } from './calc';

describe('calculatePayroll', () => {
  it('начисляет полный оклад при полной норме дней', () => {
    expect(calculatePayroll(100_000, 20, 20)).toEqual({
      gross: 100_000,
      ndfl: 13_000,
      net: 87_000,
    });
  });

  it('пропорционально уменьшает оклад и добавляет премию', () => {
    expect(calculatePayroll(100_000, 15, 20, 10_000)).toEqual({
      gross: 85_000,
      ndfl: 11_050,
      net: 73_950,
    });
  });

  it('округляет начисления и НДФЛ до целых рублей', () => {
    expect(calculatePayroll(90_000, 15, 22, 5_000)).toEqual({
      gross: 66_364,
      ndfl: 8_627,
      net: 57_737,
    });
  });

  it('при нулевой норме дней начисляет только премию', () => {
    expect(calculatePayroll(100_000, 0, 0, 5_000)).toEqual({
      gross: 5_000,
      ndfl: 650,
      net: 4_350,
    });
  });

  it('возвращает нули без оклада, дней и премии', () => {
    expect(calculatePayroll(0, 0, 20, 0)).toEqual({ gross: 0, ndfl: 0, net: 0 });
  });

  it('не учитывает оплаченные дни сверх нормы как переработку', () => {
    expect(calculatePayroll(100_000, 25, 20)).toEqual({
      gross: 125_000,
      ndfl: 16_250,
      net: 108_750,
    });
  });
});
