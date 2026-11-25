import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Info,
  Printer,
  Users,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { CellValue } from '@/shared/lib/export';
import { exportExcel, printDocument, todayStamp } from '@/shared/lib/export';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import {
  eventTypeMeta,
  projectStatusMeta,
  timesheetStatusMeta,
} from '@/shared/lib/meta';
import { formatDate, formatMoney, fullName, monthKey, monthLabel, plural, todayISO } from '@/shared/lib/utils';
import { isAssignmentActiveOn } from '@/shared/lib/workload';
import { findEmployeeAbsenceNote, formatAbsenceNote } from '@/shared/lib/absences';
import { MonthSwitcher, PageHeader, StatCard } from '@/shared/ui/page';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Select, Skeleton } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { TBody, TD, TH, THead, TR, Table } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

type ReportKey =
  | 'timesheet'
  | 'projectTeams'
  | 'workload'
  | 'movement'
  | 'vacations'
  | 'departments';

const reportKeys: ReportKey[] = [
  'timesheet',
  'projectTeams',
  'workload',
  'movement',
  'vacations',
  'departments',
];

interface ReportTable {
  title?: string;
  columns: string[];
  rows: CellValue[][];
  moneyColumns?: number[];
}

interface ReportData {
  title: string;
  subtitle: string;
  tables: ReportTable[];
}

const reportMeta: Record<ReportKey, { label: string; description: string; icon: typeof Users }> = {
  timesheet: {
    label: 'Табель учёта рабочего времени',
    description: 'Явки, отпуска, больничные и командировки за месяц',
    icon: CalendarRange,
  },
  projectTeams: {
    label: 'Загруженность проектов и команды',
    description: 'Проекты, участники, роли и загрузка на текущую дату',
    icon: FolderKanban,
  },
  workload: {
    label: 'Загрузка по проектам',
    description: 'Распределение сотрудников по проектам',
    icon: FolderKanban,
  },
  movement: {
    label: 'Движение кадров',
    description: 'Приёмы, переводы, повышения и увольнения за месяц',
    icon: BarChart3,
  },
  vacations: {
    label: 'Остатки отпусков',
    description: 'Положено, использовано, запланировано и остаток по сотрудникам',
    icon: CalendarRange,
  },
  departments: {
    label: 'Сводка по подразделениям',
    description: 'Численность, статусы и вилки окладов по должностям',
    icon: Users,
  },
};

export function ReportsPage() {
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const { employees, positions, departments, departmentById, employeeById, projectById, projects } = useLookups();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const requestedReport = searchParams.get('report');
  const initialReport =
    requestedReport && reportKeys.includes(requestedReport as ReportKey)
      ? (requestedReport as ReportKey)
      : 'timesheet';

  const [report, setReport] = useState<ReportKey>(initialReport);
  const [period, setPeriod] = useState(monthKey());
  const [departmentId, setDepartmentId] = useState('');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('project') ?? '');

  const canSeeSalaries = user?.role === 'admin' || user?.role === 'hr';
  const scopedDepartmentId = managerDepartmentId ?? (departmentId || undefined);
  const monthDependent = report === 'timesheet' || report === 'movement';

  const timesheetQuery = useQuery({
    queryKey: ['report', 'timesheet', period, scopedDepartmentId],
    queryFn: () => api.timesheet.get({ month: period, departmentId: scopedDepartmentId }),
    enabled: report === 'timesheet',
  });

  const eventsQuery = useQuery({
    queryKey: ['report', 'events', period],
    queryFn: () => api.events.list({ month: period }),
    enabled: report === 'movement',
  });

  const assignmentsQuery = useQuery({
    queryKey: ['report', 'assignments'],
    queryFn: () => api.assignments.list(),
    enabled: report === 'projectTeams' || report === 'workload' || report === 'departments',
  });

  const absencesQuery = useQuery({
    queryKey: ['report', 'absences'],
    queryFn: () => api.absences.list({ status: 'approved' }),
    enabled: report === 'projectTeams',
  });

  const vacationsQuery = useQuery({
    queryKey: ['report', 'vacations', period],
    queryFn: () => api.vacations.balances({ year: Number(period.slice(0, 4)) }),
    enabled: report === 'vacations',
  });

  const availableReports: ReportKey[] = reportKeys;

  const allScopedEmployees = useMemo(
    () =>
      employees.filter((employee) =>
        scopedDepartmentId ? employee.departmentId === scopedDepartmentId : true,
      ),
    [employees, scopedDepartmentId],
  );
  const scopedEmployees = useMemo(
    () => allScopedEmployees.filter((employee) => employee.status !== 'dismissed'),
    [allScopedEmployees],
  );
  const scopedIds = useMemo(() => new Set(scopedEmployees.map((employee) => employee.id)), [scopedEmployees]);
  const allScopedIds = useMemo(
    () => new Set(allScopedEmployees.map((employee) => employee.id)),
    [allScopedEmployees],
  );
  const reportEmployees = report === 'movement' ? allScopedEmployees : scopedEmployees;

  const today = todayISO();
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => isAssignmentActiveOn(assignment, projectById, today)),
    [assignments, projectById, today],
  );

  const projectTeamEmployeeCount = useMemo(() => {
    if (report !== 'projectTeams') return reportEmployees.length;
    const selectedProject = projectFilter
      ? projects.find((project) => project.id === projectFilter)
      : undefined;
    const source = selectedProject
      ? assignments.filter(
          (assignment) =>
            assignment.projectId === selectedProject.id &&
            (selectedProject.status === 'completed' ||
              isAssignmentActiveOn(assignment, projectById, today)),
        )
      : activeAssignments;
    return new Set(
      source
        .filter((assignment) => allScopedIds.has(assignment.employeeId))
        .map((assignment) => assignment.employeeId),
    ).size;
  }, [
    report,
    reportEmployees.length,
    projectFilter,
    projects,
    assignments,
    activeAssignments,
    projectById,
    today,
    allScopedIds,
  ]);

  const data = useMemo<ReportData | null>(() => {
    const deptName = scopedDepartmentId
      ? (departmentById.get(scopedDepartmentId)?.name ?? 'Все подразделения')
      : 'Все подразделения';
    const periodLabel = monthLabel(`${period}-01`);

    if (report === 'timesheet') {
      const timesheet = timesheetQuery.data;
      if (!timesheet) return null;
      const rowsData = timesheet.rows.map((row) => {
        const employee = employeeById.get(row.employeeId);
        return [
          employee ? fullName(employee) : row.employeeId,
          employee ? departmentById.get(employee.departmentId)?.name ?? '—' : '—',
          row.normDays,
          row.workedDays,
          row.vacationDays,
          row.sickDays,
          row.tripDays,
          row.absentDays,
          row.totalHours,
          timesheetStatusMeta[row.status].label,
        ];
      });
      const totals = timesheet.rows.reduce(
        (acc, row) => ({
          worked: acc.worked + row.workedDays,
          vacation: acc.vacation + row.vacationDays,
          sick: acc.sick + row.sickDays,
          trip: acc.trip + row.tripDays,
          absent: acc.absent + row.absentDays,
          hours: acc.hours + row.totalHours,
        }),
        { worked: 0, vacation: 0, sick: 0, trip: 0, absent: 0, hours: 0 },
      );
      return {
        title: `Табель учёта рабочего времени · ${periodLabel}`,
        subtitle: `${deptName} · норма ${timesheet.normDays} ${plural(timesheet.normDays, ['день', 'дня', 'дней'])}`,
        tables: [
          {
            columns: ['Сотрудник', 'Подразделение', 'Норма', 'Я', 'ОТ', 'Б', 'К', 'П/Н', 'Часы', 'Статус'],
            rows: rowsData,
          },
          {
            title: 'Итоги',
            columns: ['Показатель', 'Явки', 'Отпуска', 'Больничные', 'Командировки', 'Прогулы/неявки', 'Часы'],
            rows: [['Всего', totals.worked, totals.vacation, totals.sick, totals.trip, totals.absent, totals.hours]],
          },
        ],
      };
    }

    if (report === 'vacations') {
      if (!vacationsQuery.data) return null;
      const year = Number(period.slice(0, 4));
      const balances = vacationsQuery.data.filter((balance) =>
        allScopedIds.has(balance.employeeId),
      );
      const rowsData = balances
        .map((balance) => {
          const employee = employeeById.get(balance.employeeId);
          return [
            employee ? fullName(employee) : balance.employeeId,
            employee ? departmentById.get(employee.departmentId)?.name ?? '—' : '—',
            balance.entitlement,
            balance.carryover,
            balance.used,
            balance.planned,
            balance.remaining,
          ] as CellValue[];
        })
        .sort(
          (a, b) =>
            String(a[1]).localeCompare(String(b[1]), 'ru') ||
            String(a[0]).localeCompare(String(b[0]), 'ru'),
        );
      const totals = balances.reduce(
        (acc, balance) => ({
          entitlement: acc.entitlement + balance.entitlement,
          carryover: acc.carryover + balance.carryover,
          used: acc.used + balance.used,
          planned: acc.planned + balance.planned,
          remaining: acc.remaining + balance.remaining,
        }),
        { entitlement: 0, carryover: 0, used: 0, planned: 0, remaining: 0 },
      );
      return {
        title: `Остатки отпусков · ${year}`,
        subtitle: `${deptName} · сотрудников ${balances.length}`,
        tables: [
          {
            columns: [
              'Сотрудник',
              'Подразделение',
              'Положено',
              'Перенос',
              'Использовано',
              'Запланировано',
              'Остаток',
            ],
            rows: rowsData,
          },
          {
            title: 'Итоги',
            columns: ['Показатель', 'Положено', 'Перенос', 'Использовано', 'Запланировано', 'Остаток'],
            rows: [
              [
                'Всего',
                totals.entitlement,
                totals.carryover,
                totals.used,
                totals.planned,
                totals.remaining,
              ],
            ],
          },
        ],
      };
    }

    if (report === 'projectTeams') {
      if (!assignmentsQuery.data) return null;
      const selectedProject = projectFilter
        ? projects.find((project) => project.id === projectFilter)
        : undefined;
      const reportProjects = selectedProject
        ? [selectedProject]
        : projects.filter((project) => project.status !== 'completed');
      const projectIds = new Set(reportProjects.map((project) => project.id));
      const reportAssignments = selectedProject
        ? assignments.filter(
            (assignment) =>
              assignment.projectId === selectedProject.id &&
              (selectedProject.status === 'completed' ||
                isAssignmentActiveOn(assignment, projectById, today)),
          )
        : activeAssignments;
      const visibleAssignments = reportAssignments.filter(
        (assignment) =>
          projectIds.has(assignment.projectId) &&
          allScopedIds.has(assignment.employeeId),
      );

      const projectRows = reportProjects.map((project) => {
        const list = visibleAssignments.filter(
          (assignment) => assignment.projectId === project.id,
        );
        const participants = new Set(list.map((assignment) => assignment.employeeId)).size;
        const total = list.reduce((sum, assignment) => sum + assignment.allocation, 0);
        const manager = project.managerId ? employeeById.get(project.managerId) : null;
        return [
          project.name,
          project.code,
          projectStatusMeta[project.status].label,
          manager ? fullName(manager) : '—',
          `${formatDate(project.startDate)} — ${project.endDate ? formatDate(project.endDate) : 'бессрочно'}`,
          participants,
          total,
          participants ? Math.round(total / participants) : 0,
        ] as CellValue[];
      });

      const detailRows = visibleAssignments
        .map((assignment) => {
          const employee = employeeById.get(assignment.employeeId);
          const project = projectById.get(assignment.projectId);
          const absence = employee
            ? findEmployeeAbsenceNote(absencesQuery.data ?? [], employee.id, today)
            : null;
          const absenceText = absence ? formatAbsenceNote(absence) : '—';
          return {
            project: project?.name ?? assignment.projectId,
            code: project?.code ?? '',
            employee: employee ? fullName(employee) : assignment.employeeId,
            department: employee
              ? departmentById.get(employee.departmentId)?.name ?? '—'
              : '—',
            role: assignment.projectRole,
            allocation: assignment.allocation,
            period: `${formatDate(assignment.startDate)} — ${
              assignment.endDate ? formatDate(assignment.endDate) : 'бессрочно'
            }`,
            absence: absenceText,
          };
        })
        .sort(
          (a, b) =>
            a.project.localeCompare(b.project, 'ru') ||
            b.allocation - a.allocation ||
            a.employee.localeCompare(b.employee, 'ru'),
        )
        .map((row) => [
          row.project,
          row.code,
          row.employee,
          row.department,
          row.role,
          row.allocation,
          row.period,
          row.absence,
        ] as CellValue[]);

      const uniqueEmployees = new Set(
        visibleAssignments.map((assignment) => assignment.employeeId),
      ).size;
      const totalAllocation = visibleAssignments.reduce(
        (sum, assignment) => sum + assignment.allocation,
        0,
      );

      return {
        title: `Загруженность проектов и команды · ${formatDate(today)}`,
        subtitle: `${deptName} · проектов ${projectRows.length} · сотрудников ${uniqueEmployees}`,
        tables: [
          {
            title: 'Проекты',
            columns: [
              'Проект',
              'Код',
              'Статус',
              'Руководитель',
              'Период',
              'Участников',
              'Суммарная загрузка, %',
              'Средняя загрузка, %',
            ],
            rows: projectRows,
          },
          {
            title: 'Сотрудники в проектах',
            columns: [
              'Проект',
              'Код',
              'Сотрудник',
              'Подразделение',
              'Роль в проекте',
              'Загрузка, %',
              'Период',
              'Отсутствие',
            ],
            rows: detailRows,
          },
          {
            title: 'Итоги',
            columns: ['Показатель', 'Значение'],
            rows: [
              ['Проектов', projectRows.length],
              ['Сотрудников', uniqueEmployees],
              ['Назначений', visibleAssignments.length],
              [
                'Средняя загрузка, %',
                uniqueEmployees ? Math.round(totalAllocation / uniqueEmployees) : 0,
              ],
            ],
          },
        ],
      };
    }

    if (report === 'workload') {
      if (!assignmentsQuery.data) return null;
      const activeProjects = projects.filter((project) => project.status !== 'completed');
      const activeProjectIds = new Set(activeProjects.map((project) => project.id));
      const employeeRows = scopedEmployees
        .map((employee) => {
          const employeeAssignments = activeAssignments.filter(
            (item) => item.employeeId === employee.id && activeProjectIds.has(item.projectId),
          );
          const total = employeeAssignments.reduce((sum, item) => sum + item.allocation, 0);
          const projectsText = employeeAssignments
            .map((assignment) => {
              const project = projectById.get(assignment.projectId);
              return `${project?.code ?? assignment.projectId} ${assignment.allocation}%`;
            })
            .join(', ');
          return [
            fullName(employee),
            departmentById.get(employee.departmentId)?.name ?? '—',
            employeeAssignments.length,
            total,
            projectsText || '—',
          ] as CellValue[];
        })
        .sort((a, b) => Number(b[3]) - Number(a[3]));
      const projectRows = activeProjects.map((project) => {
          const list = activeAssignments.filter(
            (assignment) => assignment.projectId === project.id && scopedIds.has(assignment.employeeId),
          );
          return [
            project.name,
            projectStatusMeta[project.status].label,
            new Set(list.map((assignment) => assignment.employeeId)).size,
            list.reduce((sum, assignment) => sum + assignment.allocation, 0),
          ] as CellValue[];
        });
      return {
        title: 'Матрица загрузки по проектам',
        subtitle: `${deptName} · ${scopedEmployees.length} ${plural(scopedEmployees.length, ['сотрудник', 'сотрудника', 'сотрудников'])}`,
        tables: [
          {
            title: 'Сотрудники',
            columns: ['Сотрудник', 'Подразделение', 'Проектов', 'Загрузка, %', 'Проекты'],
            rows: employeeRows,
          },
          {
            title: 'Проекты',
            columns: ['Проект', 'Статус', 'Участников', 'Суммарная загрузка, %'],
            rows: projectRows,
          },
        ],
      };
    }

    if (report === 'movement') {
      if (!eventsQuery.data) return null;
      const events = eventsQuery.data.filter((event) => allScopedIds.has(event.employeeId));
      const rowsData = events.map((event) => {
        const employee = employeeById.get(event.employeeId);
        return [
          event.date,
          employee ? fullName(employee) : event.employeeId,
          eventTypeMeta[event.type].label,
          event.title,
          event.description ?? '—',
        ];
      });
      const byType = new Map<string, number>();
      events.forEach((event) => {
        const label = eventTypeMeta[event.type].label;
        byType.set(label, (byType.get(label) ?? 0) + 1);
      });
      return {
        title: `Движение кадров · ${periodLabel}`,
        subtitle: `${deptName} · ${events.length} ${plural(events.length, ['событие', 'события', 'событий'])}`,
        tables: [
          {
            columns: ['Дата', 'Сотрудник', 'Тип', 'Событие', 'Комментарий'],
            rows: rowsData,
          },
          {
            title: 'Сводка по типам',
            columns: ['Тип события', 'Количество'],
            rows: [...byType.entries()],
          },
        ],
      };
    }

    const list = departments.filter((department) => !scopedDepartmentId || department.id === scopedDepartmentId);
    const rowsData = list.map((department) => {
      const staff = scopedEmployees.filter((employee) => employee.departmentId === department.id);
      const head = department.headId ? employeeById.get(department.headId) : null;
      const row: CellValue[] = [
        department.name,
        department.code,
        head ? fullName(head) : '—',
        staff.length,
        staff.filter((employee) => employee.status === 'probation').length,
        staff.filter((employee) => employee.status === 'vacation').length,
        staff.filter((employee) => employee.status === 'sick_leave').length,
      ];
      return row;
    });
    const departmentColumns = [
      'Подразделение',
      'Код',
      'Руководитель',
      'Численность',
      'Испытательный',
      'В отпуске',
      'Больничный',
    ];
    const totalColumns = ['Показатель', 'Численность'];
    const totalRow: CellValue[] = ['Всего', scopedEmployees.length];

    const staffingRows = positions
      .filter((position) => !scopedDepartmentId || position.departmentId === scopedDepartmentId)
      .sort((a, b) => {
        const departmentCompare = (
          departmentById.get(a.departmentId)?.name ?? ''
        ).localeCompare(departmentById.get(b.departmentId)?.name ?? '', 'ru');
        if (departmentCompare !== 0) return departmentCompare;
        const familyCompare = a.family.localeCompare(b.family, 'ru');
        if (familyCompare !== 0) return familyCompare;
        return a.grade - b.grade;
      })
      .map((position) => {
        const row: CellValue[] = [
          departmentById.get(position.departmentId)?.name ?? '—',
          position.family,
          position.name,
          position.grade,
          scopedEmployees.filter((employee) => employee.positionId === position.id).length,
        ];
        if (canSeeSalaries) row.push(position.salaryMin, position.salaryMax);
        return row;
      });
    const staffingColumns = [
      'Подразделение',
      'Ветка',
      'Должность',
      'Грейд',
      'Сотрудников',
    ];
    if (canSeeSalaries) staffingColumns.push('Оклад от', 'Оклад до');

    return {
      title: `${reportMeta.departments.label} · ${periodLabel}`,
      subtitle: deptName,
      tables: [
        {
          columns: departmentColumns,
          rows: rowsData,
        },
        {
          title: 'Итоги',
          columns: totalColumns,
          rows: [totalRow],
        },
        {
          title: 'Должности',
          columns: staffingColumns,
          rows: staffingRows,
          moneyColumns: canSeeSalaries ? [5, 6] : undefined,
        },
      ],
    };
  }, [
    report,
    period,
    scopedDepartmentId,
    scopedEmployees,
    scopedIds,
    allScopedIds,
    timesheetQuery.data,
    eventsQuery.data,
    assignmentsQuery.data,
    absencesQuery.data,
    vacationsQuery.data,
    assignments,
    activeAssignments,
    projectFilter,
    today,
    departments,
    projects,
    departmentById,
    employeeById,
    projectById,
    positions,
    canSeeSalaries,
  ]);

  const activeQuery =
    report === 'timesheet'
      ? timesheetQuery
      : report === 'movement'
        ? eventsQuery
        : report === 'vacations'
          ? vacationsQuery
          : assignmentsQuery;

  const handleExport = () => {
    if (!data) return;
    const sheets = data.tables.map((table, index) => ({
      name: table.title ?? reportMeta[report].label.slice(0, 28) + (index > 0 ? ` ${index + 1}` : ''),
      rows: [table.columns, ...table.rows],
    }));
    void exportExcel(`${report}_${period}_${todayStamp()}.xlsx`, sheets).catch((error) =>
      toast.error('Не удалось выгрузить Excel', getErrorMessage(error)),
    );
  };

  const meta = reportMeta[report];
  const metaDescription =
    report === 'departments' && !canSeeSalaries
      ? 'Численность и статусы подразделений'
      : meta.description;
  const ReportIcon = meta.icon;

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="Аналитика"
          title="Отчёты"
          description="Аналитические выгрузки за месяц: табель, загрузка и движение кадров"
          actions={
            <>
              {monthDependent ? <MonthSwitcher value={period} onChange={setPeriod} /> : null}
              <Button variant="outline" onClick={printDocument} disabled={!data}>
                <Printer /> PDF
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={!data}>
                <Download /> Excel
              </Button>
            </>
          }
        />
      </div>

      <div className="no-print mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Тип отчёта"
          value={meta.label}
          hint={monthDependent ? monthLabel(`${period}-01`) : 'на текущую дату'}
          icon={ReportIcon}
          tone="primary"
        />
        <StatCard
          label="Сотрудников в выборке"
          value={projectTeamEmployeeCount}
          hint={
            scopedDepartmentId
              ? departmentById.get(scopedDepartmentId)?.name ?? '—'
              : 'все подразделения'
          }
          icon={Users}
          tone="info"
        />
        <StatCard label="Формат" value="PDF / Excel" hint="печать и выгрузка" icon={FileSpreadsheet} tone="purple" />
        <StatCard label="Период" value={monthDependent ? monthLabel(`${period}-01`) : '—'} icon={CalendarRange} tone="success" />
      </div>

      <Card className="no-print mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={report}
            onChange={(event) => setReport(event.target.value as ReportKey)}
            className="w-auto min-w-[280px]"
          >
            {availableReports.map((key) => (
              <option key={key} value={key}>
                {reportMeta[key].label}
              </option>
            ))}
          </Select>
          {!managerDepartmentId ? (
            <Select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="w-auto min-w-[190px]"
            >
              <option value="">Все подразделения</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone="info">
              Подразделение: {departmentById.get(managerDepartmentId)?.name ?? '—'}
            </Badge>
          )}
          {report === 'projectTeams' ? (
            <Select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="w-auto min-w-[220px]"
              aria-label="Проект"
            >
              <option value="">Все проекты</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </Select>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
            <Info className="size-3.5" /> {metaDescription}
          </span>
        </div>
      </Card>

      {activeQuery.isError ? (
        <ErrorState message={getErrorMessage(activeQuery.error)} />
      ) : activeQuery.isLoading || !data ? (
        <Skeleton className="h-72 w-full" />
      ) : data.tables.every((table) => table.rows.length === 0) ? (
        <Card>
          <EmptyState
            title="Нет данных за выбранный период"
            description="Измените месяц или подразделение, чтобы построить отчёт."
            icon={ReportIcon}
          />
        </Card>
      ) : (
        <Card className="print-area overflow-hidden">
          <CardHeader
            title={data.title}
            description={data.subtitle}
            actions={<Badge tone="default">Демо-данные</Badge>}
          />
          {data.tables.map((table, index) => (
            <div key={`${table.title ?? 'main'}-${index}`} className={index > 0 ? 'print-page-break' : undefined}>
              {table.title ? (
                <div className="border-y border-border bg-surface-2/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted first:border-t-0">
                  {table.title}
                </div>
              ) : null}
              <Table>
                <THead>
                  <tr>
                    {table.columns.map((column, columnIndex) => (
                      <TH
                        key={column}
                        className={
                          table.rows.some((row) => typeof row[columnIndex] === 'number')
                            ? 'text-right'
                            : undefined
                        }
                      >
                        {column}
                      </TH>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {table.rows.length === 0 ? (
                    <tr>
                      <TD colSpan={table.columns.length} className="text-xs text-muted">
                        Нет данных
                      </TD>
                    </tr>
                  ) : (
                    table.rows.map((row, rowIndex) => (
                      <TR key={rowIndex}>
                        {row.map((cell, cellIndex) => {
                          const isMoney =
                            typeof cell === 'number' && table.moneyColumns?.includes(cellIndex);
                          return (
                            <TD
                              key={cellIndex}
                              className={
                                typeof cell === 'number'
                                  ? 'whitespace-nowrap text-right text-xs text-fg'
                                  : 'text-xs text-muted first:text-fg'
                              }
                            >
                              {isMoney ? formatMoney(Number(cell)) : cell}
                            </TD>
                          );
                        })}
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-[10px] text-muted">
            <span>
              Сформировано {new Date().toLocaleString('ru-RU')} · система кадрового учёта (демо)
            </span>
            <span>
              {projectTeamEmployeeCount}{' '}
              {plural(projectTeamEmployeeCount, ['сотрудник', 'сотрудника', 'сотрудников'])} в выборке
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
