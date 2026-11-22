export interface PayrollResult {
  gross: number;
  ndfl: number;
  net: number;
}

export function calculatePayroll(
  baseSalary: number,
  paidDays: number,
  normDays: number,
  bonus = 0,
): PayrollResult {
  if (normDays <= 0) {
    return { gross: Math.round(bonus), ndfl: Math.round(bonus * 0.13), net: Math.round(bonus * 0.87) };
  }
  const base = (baseSalary / normDays) * paidDays;
  const gross = Math.round(base + bonus);
  const ndfl = Math.round(gross * 0.13);
  return { gross, ndfl, net: gross - ndfl };
}
