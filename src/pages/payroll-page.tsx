import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  Download,
  FileSpreadsheet,
  Info,
  Printer,
  Wallet,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Payslip } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { payrollStatusMeta } from '@/shared/lib/meta';
import {
  formatMoney,
  monthKey,
  monthLabel,
  plural,
} from '@/shared/lib/utils';
import { exportExcel, printDocument, todayStamp } from '@/shared/lib/export';
import { MonthSwitcher, PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/primitives';
import { TBody, TD, TH, THead, TR, Table } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

function BonusInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="number"
      min={0}
      step={1000}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(Number(event.target.value))}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
      className="h-7 w-24 rounded-md bg-surface-2 px-2 text-right text-xs text-fg focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
      aria-label="Премия"
    />
  );
}

export function PayrollPage() {
  const user = useAuthStore((state) => state.user);
  const { employeeById } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [period, setPeriod] = useState(monthKey());
  const [search, setSearch] = useState('');

  const isEmployee = user?.role === 'employee';
  const canEdit = can(user?.role, 'payroll:write');

  const query = useQuery({
    queryKey: ['payroll', period],
    queryFn: () => api.payroll.list(period),
  });

  const calculateMutation = useMutation({
    mutationFn: () => api.payroll.calculate(period),
    onSuccess: (payslips) => {
      queryClient.setQueryData(['payroll', period], payslips);
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Расчёт выполнен', `Сформировано листов: ${payslips.length}`);
    },
    onError: (error) => toast.error('Не удалось выполнить расчёт', getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { bonus?: number; status?: 'draft' | 'approved' } }) =>
      api.payroll.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Расчётный лист обновлён');
    },
    onError: (error) => toast.error('Не удалось обновить лист', getErrorMessage(error)),
  });

  const allPayslips = useMemo(() => {
    const list = query.data ?? [];
    if (isEmployee) return list.filter((payslip) => payslip.employeeId === user?.employeeId);
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((payslip) => {
      const employee = employeeById.get(payslip.employeeId);
      return employee
        ? `${employee.lastName} ${employee.firstName} ${employee.middleName ?? ''}`
            .toLowerCase()
            .includes(term)
        : false;
    });
  }, [query.data, isEmployee, user?.employeeId, search, employeeById]);

  const totals = useMemo(
    () =>
      allPayslips.reduce(
        (acc, payslip) => ({
          gross: acc.gross + payslip.gross,
          ndfl: acc.ndfl + payslip.ndfl,
          net: acc.net + payslip.net,
          bonus: acc.bonus + payslip.bonus,
        }),
        { gross: 0, ndfl: 0, net: 0, bonus: 0 },
      ),
    [allPayslips],
  );

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Период', 'Сотрудник', 'Подразделение', 'Оклад', 'Норма дней', 'Оплачено дней', 'Премия', 'Начислено', 'НДФЛ 13%', 'К выплате'],
      ...allPayslips.map((payslip) => {
        const employee = employeeById.get(payslip.employeeId);
        return [
          period,
          employee ? `${employee.lastName} ${employee.firstName} ${employee.middleName ?? ''}`.trim() : payslip.employeeId,
          employee ? employee.departmentId : '',
          payslip.baseSalary,
          payslip.normDays,
          payslip.paidDays,
          payslip.bonus,
          payslip.gross,
          payslip.ndfl,
          payslip.net,
        ];
      }),
      ['', 'Итого', '', '', '', '', totals.bonus, totals.gross, totals.ndfl, totals.net],
    ];
    void exportExcel(`payroll_${period}_${todayStamp()}.xlsx`, [
      { name: `Ведомость ${period}`, rows },
    ]).catch((error) => toast.error('Не удалось выгрузить Excel', getErrorMessage(error)));
  };

  const personal = allPayslips[0];

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="Финансы"
          title="Зарплата"
          description="Расчётные листы за месяц и упрощённый демо-расчёт"
          actions={
            <>
              <MonthSwitcher value={period} onChange={setPeriod} />
              <Button variant="outline" onClick={printDocument} title="Печать / PDF">
                <Printer /> PDF
              </Button>
              <Button variant="outline" onClick={handleExport} title="Выгрузить в Excel">
                <Download /> Excel
              </Button>
              {canEdit ? (
                <Button
                  onClick={() => calculateMutation.mutate()}
                  loading={calculateMutation.isPending}
                >
                  <Calculator /> Пересчитать
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <div className="no-print mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[11px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-semibold">Демо-расчёт.</span> Формула: оклад / норма дней месяца ×
          оплаченные дни (явки, отпуск, командировка) + премия. НДФЛ 13% показан справочно, без
          вычетов и страховых взносов. Не является бухгалтерским расчётом.
        </p>
      </div>

      {!isEmployee && !canEdit ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>Ведомость доступна только для просмотра. Расчёт и изменение премий выполняет администратор.</p>
        </div>
      ) : null}

      {isEmployee ? (
        <div className="no-print mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="К выплате"
            value={personal ? formatMoney(personal.net) : '—'}
            hint={monthLabel(`${period}-01`)}
            icon={Wallet}
            tone="success"
          />
          <StatCard
            label="Начислено"
            value={personal ? formatMoney(personal.gross) : '—'}
            hint={personal ? `НДФЛ ${formatMoney(personal.ndfl)}` : undefined}
            icon={Wallet}
            tone="info"
          />
          <StatCard
            label="Оплачено дней"
            value={personal ? `${personal.paidDays} / ${personal.normDays}` : '—'}
            hint={personal ? `оклад ${formatMoney(personal.baseSalary)}` : undefined}
            icon={Wallet}
            tone="purple"
          />
        </div>
      ) : (
        <div className="no-print mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Сотрудников в ведомости" value={allPayslips.length} icon={Wallet} tone="info" />
          <StatCard label="Начислено" value={formatMoney(totals.gross)} hint={`премии ${formatMoney(totals.bonus)}`} icon={Wallet} tone="primary" />
          <StatCard label="НДФЛ 13%" value={formatMoney(totals.ndfl)} hint="справочно" icon={Wallet} tone="warning" />
          <StatCard label="К выплате" value={formatMoney(totals.net)} icon={Wallet} tone="success" />
        </div>
      )}

      {!isEmployee ? (
        <Card className="no-print mb-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Поиск сотрудника в ведомости…"
              className="min-w-[240px] flex-1"
            />
            <span className="text-[11px] text-muted">
              Период: <span className="font-medium text-fg">{monthLabel(`${period}-01`)}</span>
            </span>
          </div>
        </Card>
      ) : null}

      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} />
      ) : query.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : allPayslips.length === 0 ? (
        <Card>
          <EmptyState
            title={isEmployee ? 'Расчётный лист не сформирован' : 'Ведомость пуста'}
            description={
              canEdit
                ? 'Нажмите «Пересчитать», чтобы сформировать расчётные листы за выбранный месяц.'
                : 'Расчётный лист появится после того, как администратор сформирует ведомость.'
            }
            icon={Wallet}
            action={
              canEdit ? (
                <Button onClick={() => calculateMutation.mutate()} loading={calculateMutation.isPending}>
                  <Calculator /> Сформировать ведомость
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="print-area overflow-hidden">
          <CardHeader
            title={`Расчётная ведомость · ${monthLabel(`${period}-01`)}`}
            description={`${allPayslips.length} ${plural(allPayslips.length, ['сотрудник', 'сотрудника', 'сотрудников'])} · демо-расчёт, НДФЛ 13% справочно`}
            actions={
              <span className="text-[11px] text-muted">
                Сформировано: {new Date().toLocaleDateString('ru-RU')}
              </span>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Сотрудник</TH>
                <TH className="text-right">Оклад</TH>
                <TH className="text-center">Норма / оплачено</TH>
                <TH className="text-right">Премия</TH>
                <TH className="text-right">Начислено</TH>
                <TH className="text-right">НДФЛ</TH>
                <TH className="text-right">К выплате</TH>
                <TH>Статус</TH>
              </tr>
            </THead>
            <TBody>
              {allPayslips.map((payslip: Payslip) => {
                const employee = employeeById.get(payslip.employeeId);
                return (
                  <TR key={payslip.id}>
                    <TD>
                      <Link
                        to={isEmployee ? '/me' : `/employees/${payslip.employeeId}`}
                        className="flex items-center gap-2"
                      >
                        {employee ? (
                          <Avatar
                            lastName={employee.lastName}
                            firstName={employee.firstName}
                            size="xs"
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-fg hover:text-primary">
                            {employee
                              ? `${employee.lastName} ${employee.firstName} ${employee.middleName ?? ''}`.trim()
                              : payslip.employeeId}
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {employee ? employee.personnelNumber : '—'}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-right text-xs text-muted">
                      {formatMoney(payslip.baseSalary)}
                    </TD>
                    <TD className="whitespace-nowrap text-center text-xs text-muted">
                      {payslip.normDays} / <span className="font-medium text-fg">{payslip.paidDays}</span>
                    </TD>
                    <TD className="text-right">
                      <BonusInput
                        value={payslip.bonus}
                        disabled={!canEdit}
                        onCommit={(bonus) => updateMutation.mutate({ id: payslip.id, payload: { bonus } })}
                      />
                    </TD>
                    <TD className="whitespace-nowrap text-right text-xs font-medium text-fg">
                      {formatMoney(payslip.gross)}
                    </TD>
                    <TD className="whitespace-nowrap text-right text-xs text-muted">
                      −{formatMoney(payslip.ndfl)}
                    </TD>
                    <TD className="whitespace-nowrap text-right text-xs font-semibold text-fg">
                      {formatMoney(payslip.net)}
                    </TD>
                    <TD>
                      {canEdit ? (
                        <Select
                          value={payslip.status}
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: payslip.id,
                              payload: { status: event.target.value as 'draft' | 'approved' },
                            })
                          }
                          className="h-7 w-[130px] text-[11px]"
                        >
                          {Object.entries(payrollStatusMeta).map(([value, meta]) => (
                            <option key={value} value={value}>
                              {meta.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone={payrollStatusMeta[payslip.status].tone}>
                          {payrollStatusMeta[payslip.status].label}
                        </Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            <tfoot className="bg-surface-2/80">
              <tr>
                <TD className="text-xs font-semibold text-fg">Итого</TD>
                <TD />
                <TD />
                <TD className="whitespace-nowrap text-right text-xs font-semibold text-fg">
                  {formatMoney(totals.bonus)}
                </TD>
                <TD className="whitespace-nowrap text-right text-xs font-semibold text-fg">
                  {formatMoney(totals.gross)}
                </TD>
                <TD className="whitespace-nowrap text-right text-xs font-semibold text-fg">
                  −{formatMoney(totals.ndfl)}
                </TD>
                <TD className="whitespace-nowrap text-right text-xs font-semibold text-primary">
                  {formatMoney(totals.net)}
                </TD>
                <TD />
              </tr>
            </tfoot>
          </Table>
          <div className="flex items-center gap-2 border-t border-border px-5 py-2.5 text-[10px] text-muted">
            <FileSpreadsheet className="size-3.5" />
            Демо-расчёт. Для бухгалтерии требуется учёт вычетов, взносов и районных коэффициентов.
          </div>
        </Card>
      )}
    </div>
  );
}
