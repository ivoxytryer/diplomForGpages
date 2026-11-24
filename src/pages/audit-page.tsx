import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ClipboardList,
  Download,
  History,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { AuditEntry } from '@/shared/types';
import { exportExcel, todayStamp } from '@/shared/lib/export';
import { formatDateTime, plural } from '@/shared/lib/utils';
import { PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import { Badge, Card, CardHeader, EmptyState, ErrorState } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { TBody, TD, TH, THead, TR, Table } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

const entityLabels: Record<string, string> = {
  employee: 'Сотрудник',
  user: 'Пользователь',
  absence: 'Отсутствие',
  project: 'Проект',
  assignment: 'Назначение',
  department: 'Подразделение',
  position: 'Должность',
  event: 'Кадровое событие',
  task: 'Задача',
  timesheet: 'Табель',
  auth: 'Авторизация',
};

/** Локализация старых записей аудита, сохранённых до перевода detail-полей. */
const legacyDetailLabels: Record<string, string> = {
  vacation: 'Отпуск',
  sick: 'Больничный',
  business_trip: 'Командировка',
  unpaid: 'Без сохранения',
  study: 'Учебный отпуск',
  draft: 'Черновик',
  submitted: 'На проверке',
  approved: 'Утверждён',
  pending: 'На согласовании',
  rejected: 'Отклонено',
  employee: 'Сотрудник',
  hr: 'HR-специалист',
  manager: 'Руководитель',
  admin: 'Администратор',
};

function localizeDetails(details?: string) {
  if (typeof details !== 'string' || !details) return details;
  return details
    .split(' · ')
    .map((part) => legacyDetailLabels[part.trim()] ?? part)
    .join(' · ');
}

export function AuditPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['audit'],
    queryFn: api.audit.list,
  });

  const entries = useMemo(() => query.data ?? [], [query.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) => {
      const label = entityLabels[entry.entity] ?? entry.entity;
      return [entry.userName, entry.action, label, entry.details ?? '', entry.entityId]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [entries, search]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = entries.filter((entry) => entry.at.startsWith(today)).length;
  const uniqueUsers = new Set(entries.map((entry) => entry.userId)).size;
  const entityCount = new Set(entries.map((entry) => entry.entity)).size;

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Дата и время', 'Пользователь', 'Действие', 'Объект', 'ID объекта', 'Детали'],
      ...filtered.map((entry) => [
        formatDateTime(entry.at),
        entry.userName,
        entry.action,
        entityLabels[entry.entity] ?? entry.entity,
        entry.entityId,
        localizeDetails(entry.details) ?? '',
      ]),
    ];
    void exportExcel(`audit_${todayStamp()}.xlsx`, [{ name: 'Журнал действий', rows }]).catch((error) =>
      toast.error('Не удалось выгрузить журнал', getErrorMessage(error)),
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow="Администрирование"
        title="Журнал действий"
        description="Аудит изменений в системе: кто, когда и что изменил"
        actions={
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <Download /> Excel
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Записей в журнале" value={entries.length} icon={ClipboardList} tone="info" />
        <StatCard label="За сегодня" value={todayCount} icon={Activity} tone="success" />
        <StatCard label="Активных пользователей" value={uniqueUsers} icon={UserRound} tone="purple" />
        <StatCard label="Типов объектов" value={entityCount} icon={History} tone="warning" />
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Пользователь, действие, объект…"
            className="min-w-[240px] flex-1"
          />
          <span className="text-[11px] text-muted">
            Показано: <span className="font-medium text-fg">{filtered.length}</span> из {entries.length}
          </span>
        </div>
      </Card>

      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} />
      ) : query.isLoading ? (
        <Card>
          <div className="space-y-2 p-5">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-border/50" />
            ))}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="Записи не найдены"
            description="Измените поисковый запрос. Журнал хранит последние 200 действий."
            icon={ShieldCheck}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Последние действия"
            description={`${filtered.length} ${plural(filtered.length, ['запись', 'записи', 'записей'])} · хранение до 200 последних операций`}
            actions={<Badge tone="neutral">Только чтение</Badge>}
          />
          <Table>
            <THead>
              <tr>
                <TH>Дата и время</TH>
                <TH>Пользователь</TH>
                <TH>Действие</TH>
                <TH>Объект</TH>
                <TH>Детали</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((entry: AuditEntry) => (
                <TR key={entry.id}>
                  <TD className="whitespace-nowrap text-[11px] text-muted">
                    {formatDateTime(entry.at)}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-500/15 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {(entry.userName ?? '')
                          .split(' ')
                          .slice(0, 2)
                          .map((part) => part.charAt(0))
                          .join('')}
                      </span>
                      <span className="truncate text-xs font-medium text-fg">{entry.userName}</span>
                    </div>
                  </TD>
                  <TD className="text-xs text-fg">{entry.action}</TD>
                  <TD>
                    <Badge tone="neutral">
                      {entityLabels[entry.entity] ?? entry.entity}
                    </Badge>
                  </TD>
                  <TD className="max-w-[320px] text-[11px] text-muted">
                    {localizeDetails(entry.details) || <span className="font-mono">{entry.entityId}</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
