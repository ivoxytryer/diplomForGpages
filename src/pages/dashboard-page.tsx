import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  CalendarClock,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import { eventTypeMeta } from '@/shared/lib/meta';
import {
  formatDate,
  fullName,
  monthShortLabel,
  plural,
  shortName,
} from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, Badge, ErrorState, Avatar, Skeleton } from '@/shared/ui/primitives';
import { PageHeader } from '@/shared/ui/page';

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 0,
  fontSize: 12,
  color: 'var(--fg)',
};

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="flex min-h-0 flex-col justify-start px-4 py-3">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="mt-1.5 block text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-fg">
        {value}
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-muted">{hint}</span>
    </div>
  );
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const { employeeById, departmentById } = useLookups();

  const dashboard = useQuery({
    queryKey: ['dashboard', managerDepartmentId],
    queryFn: () => api.dashboard.get(managerDepartmentId),
  });

  if (user?.role === 'employee') return <Navigate to="/me" replace />;

  if (dashboard.isError) {
    return <ErrorState message={getErrorMessage(dashboard.error)} />;
  }

  const data = dashboard.data;

  return (
    <div>
      <PageHeader
        eyebrow="Обзор"
        title="Дашборд"
        description="Ключевые показатели по персоналу, загрузке и кадровым событиям"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/absences?status=pending&scope=all"
              className="inline-flex h-9 items-center gap-2 border border-border bg-surface px-3 text-[11px] font-medium text-fg transition-colors hover:border-fg"
            >
              <CalendarClock className="size-3.5" />
              Заявки на согласовании
              <span className="bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg">
                {data?.pendingAbsences ?? 0}
              </span>
            </Link>
            {user ? (
              <Link
                to="/reports"
                className="inline-flex h-9 items-center gap-2 border border-border bg-surface px-3 text-[11px] font-medium text-fg transition-colors hover:border-fg"
              >
                Отчёты <ArrowUpRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
        }
      />

      {dashboard.isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[126px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="overflow-hidden border border-border bg-surface">
            <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
              <Metric
                label="Численность"
                value={data.headcount}
                hint="активных сотрудников"
              />
              <Metric
                label="На испытательном"
                value={data.probation}
                hint="сотрудников"
              />
              <Metric
                label="Активные проекты"
                value={data.activeProjects}
                hint={`средняя загрузка ${data.avgUtilization}%`}
              />
              <Metric
                label="Средняя загрузка"
                value={`${data.avgUtilization}%`}
                hint="по всем проектам"
              />
              <Metric
                label="Отсутствуют сегодня"
                value={data.absentToday}
                hint="отпуск, больничный, командировка"
              />
            </div>
          </div>

          {user?.role === 'admin' || user?.role === 'hr' ? (
            <Card className="mt-5">
              <CardHeader
                title="Требуют внимания"
                description="Что стоит проверить HR уже сегодня"
                actions={
                  <Link to="/absences?status=pending&scope=all" className="text-xs font-medium text-primary hover:underline">
                    Все заявки
                  </Link>
                }
              />
              <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <Link
                  to="/absences?status=pending&scope=all"
                  className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-surface-2/40"
                >
                  <span>
                    <span className="block text-xs font-medium text-fg">Заявки на согласовании</span>
                    <span className="block text-[10px] text-muted">отпуска, больничные, командировки</span>
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-fg">{data.pendingAbsences}</span>
                </Link>
                <Link
                  to="/absences"
                  className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-surface-2/40"
                >
                  <span>
                    <span className="block text-xs font-medium text-fg">Отсутствуют сегодня</span>
                    <span className="block text-[10px] text-muted">отпуск, больничный, командировка</span>
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-fg">{data.absentToday}</span>
                </Link>
              </div>
            </Card>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <Card>
                <CardHeader
                  title="Численность по подразделениям"
                  description="Активные сотрудники без уволенных"
                />
                <CardContent className="pt-1">
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.byDepartment}
                        layout="vertical"
                        margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={165}
                          tick={{ fontSize: 11, fill: 'var(--muted)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                        <Bar dataKey="count" name="Сотрудники" fill="var(--chart)" radius={0} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Движение персонала" description="Последние 6 месяцев" />
                  <CardContent className="pt-2">
                    <div className="h-[210px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.dynamics} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="month"
                            tickFormatter={(value: string) => monthShortLabel(`${value}-01`)}
                            tick={{ fontSize: 11, fill: 'var(--muted)' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => monthShortLabel(`${value}-01`)} />
                          <Line type="monotone" dataKey="hired" name="Принято" stroke="var(--fg)" strokeWidth={2} dot={{ r: 2.5 }} />
                          <Line type="monotone" dataKey="dismissed" name="Уволено" stroke="var(--danger)" strokeWidth={2} dot={{ r: 2.5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader
                    title="Участники проектов"
                    description="Сколько сотрудников назначено на проект"
                  />
                  <CardContent className="pt-2">
                    <div className="h-[210px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.teamByProject} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 6 }}>
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: 'var(--muted)' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            cursor={{ fill: 'var(--surface-2)' }}
                            formatter={(value) => [
                              `${value} ${plural(Number(value), ['участник', 'участника', 'участников'])}`,
                              'Команда',
                            ]}
                          />
                          <Bar dataKey="count" name="Участники" fill="var(--chart)" radius={0} barSize={13} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader
                  title="Лента событий"
                  description="Последние кадровые изменения"
                  actions={
                    <Link to="/events" className="text-xs font-medium text-primary hover:underline">
                      Все
                    </Link>
                  }
                />
                <div className="divide-y divide-border">
                  {data.recentEvents.slice(0, 6).map((event) => {
                    const employee = employeeById.get(event.employeeId);
                    const meta = eventTypeMeta[event.type];
                    return (
                      <Link
                        key={event.id}
                        to={`/employees/${event.employeeId}`}
                        className="flex items-start gap-3 px-6 py-3 transition hover:bg-surface-2/40"
                      >
                        {employee ? (
                          <Avatar lastName={employee.lastName} firstName={employee.firstName} size="sm" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-medium text-fg">{shortName(employee)}</p>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{event.title}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{formatDate(event.date)}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <CardHeader title="Ближайшие дни рождения" />
                <div className="divide-y divide-border">
                  {data.birthdays.slice(0, 5).map((item) => {
                    const employee = employeeById.get(item.employeeId);
                    return (
                      <Link
                        key={item.employeeId}
                        to={`/employees/${item.employeeId}`}
                        className="flex items-center gap-3 px-6 py-2.5 transition hover:bg-surface-2/40"
                      >
                        {employee ? (
                          <Avatar lastName={employee.lastName} firstName={employee.firstName} size="xs" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-fg">{fullName(employee)}</p>
                          <p className="text-[10px] text-muted">
                            {formatDate(item.date)} · {departmentById.get(employee?.departmentId ?? '')?.name ?? '—'}
                          </p>
                        </div>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                          {item.daysLeft === 0 ? 'сегодня' : `через ${item.daysLeft} ${plural(item.daysLeft, ['день', 'дня', 'дней'])}`}
                        </span>
                      </Link>
                    );
                  })}
                  {data.birthdays.length === 0 ? (
                    <p className="px-6 py-4 text-xs text-muted">В ближайшие 30 дней дней рождения нет.</p>
                  ) : null}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
