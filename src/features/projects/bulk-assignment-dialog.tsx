import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import type { AssignmentPayload, Employee } from '@/shared/types';
import { useLookups } from '@/shared/hooks/use-lookups';
import { useAuthStore } from '@/features/auth/auth-store';
import { ADMIN_LOAD_LIMIT, calculatePeakLoad } from '@/shared/lib/workload';
import { cn, fullName, todayISO } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, Input } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

interface BulkAssignmentDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
}

interface Candidate {
  employee: Employee;
  peak: number;
  projected: number;
}

export function BulkAssignmentDialog({ open, projectId, onClose }: BulkAssignmentDialogProps) {
  const { employees, projectById, departmentById } = useLookups();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const limit = isAdmin ? ADMIN_LOAD_LIMIT : 100;

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [projectRole, setProjectRole] = useState('Участник');
  const [allocation, setAllocation] = useState(50);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState<string | null>(null);
  const [overloadReason, setOverloadReason] = useState('');

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'all'],
    queryFn: () => api.assignments.list({}),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setSearch('');
    setProjectRole('Участник');
    setAllocation(50);
    setStartDate(todayISO());
    setEndDate(null);
    setOverloadReason('');
  }, [open, projectId]);

  const assignedIds = useMemo(
    () =>
      new Set(
        (assignmentsQuery.data ?? [])
          .filter((assignment) => assignment.projectId === projectId)
          .map((assignment) => assignment.employeeId),
      ),
    [assignmentsQuery.data, projectId],
  );

  const baseCandidates = useMemo<Candidate[]>(() => {
    const loadStart = startDate || todayISO();
    return employees
      .filter((employee) => employee.status !== 'dismissed' && !assignedIds.has(employee.id))
      .map((employee) => {
        const peak = calculatePeakLoad(
          assignmentsQuery.data ?? [],
          projectById,
          employee.id,
          loadStart,
          endDate,
        );
        return { employee, peak, projected: peak + allocation };
      })
      .sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee), 'ru'));
  }, [
    employees,
    assignedIds,
    startDate,
    endDate,
    allocation,
    assignmentsQuery.data,
    projectById,
  ]);

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return baseCandidates;
    return baseCandidates.filter(({ employee }) => {
      const department = departmentById.get(employee.departmentId)?.name ?? '';
      return `${fullName(employee)} ${department}`.toLowerCase().includes(term);
    });
  }, [baseCandidates, search, departmentById]);

  const selectable = candidates.filter((candidate) => candidate.projected <= limit);
  // Считаем по всем выбранным, даже если поиск скрыл часть строк.
  const selectedRows = baseCandidates.filter((candidate) =>
    selected.includes(candidate.employee.id),
  );
  const hasOverload = selectedRows.some((candidate) => candidate.projected > 100);
  const needsReason = isAdmin && hasOverload && !overloadReason.trim();
  const datesValid = !endDate || endDate >= startDate;

  const valid = Boolean(
    selected.length > 0 &&
      startDate &&
      allocation >= 0 &&
      allocation <= 100 &&
      datesValid &&
      selectedRows.every((candidate) => candidate.projected <= limit) &&
      !needsReason,
  );

  const toggle = (employeeId: string) => {
    setSelected((previous) =>
      previous.includes(employeeId)
        ? previous.filter((id) => id !== employeeId)
        : [...previous, employeeId],
    );
  };

  const toggleAll = () => {
    const selectableIds = selectable.map((candidate) => candidate.employee.id);
    const allSelected = selectableIds.every((id) => selected.includes(id));
    if (allSelected) {
      setSelected((previous) => previous.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelected((previous) => [...new Set([...previous, ...selectableIds])]);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payloads: AssignmentPayload[] = selected.map((employeeId) => ({
        projectId,
        employeeId,
        projectRole: projectRole.trim() || 'Участник',
        allocation,
        startDate,
        endDate: endDate || null,
        overloadReason: hasOverload ? overloadReason.trim() : undefined,
      }));
      const results = await Promise.allSettled(
        payloads.map((payload) => api.assignments.create(payload)),
      );
      return {
        total: payloads.length,
        ok: results.filter((result) => result.status === 'fulfilled').length,
      };
    },
    onSuccess: ({ total, ok }) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      if (ok === total) toast.success(`Добавлено участников: ${ok}`);
      else toast.error(`Добавлено ${ok} из ${total}. Остальных не удалось назначить.`);
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Добавить участников"
      description={projectById.get(projectId)?.name}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!valid}
            onClick={() => mutation.mutate()}
          >
            Добавить ({selected.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Роль в проекте">
            <Input
              value={projectRole}
              onChange={(event) => setProjectRole(event.target.value)}
              placeholder="Участник"
            />
          </Field>
          <Field
            label="Загрузка, %"
            hint={isAdmin ? `Лимит перегруза ${limit}%` : 'Суммарно не больше 100%'}
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              value={allocation}
              onChange={(event) => setAllocation(Number(event.target.value))}
            />
          </Field>
          <Field label="Дата начала" error={!datesValid ? 'Дата окончания раньше начала' : undefined}>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="Дата окончания">
            <Input
              type="date"
              value={endDate ?? ''}
              onChange={(event) => setEndDate(event.target.value || null)}
            />
          </Field>
        </div>

        {isAdmin && hasOverload ? (
          <Field
            label="Причина перегруза *"
            hint={`Доступно только администратору, итоговая загрузка до ${ADMIN_LOAD_LIMIT}%`}
            error={needsReason ? 'Заполните причину, чтобы сохранить' : undefined}
          >
            <Input
              value={overloadReason}
              onChange={(event) => setOverloadReason(event.target.value)}
              placeholder="Почему сотрудникам нужна загрузка выше 100%"
            />
          </Field>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ФИО или подразделение…"
              className="min-w-[220px] flex-1"
            />
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={selectable.length === 0}>
              {selectable.length > 0 && selectable.every((c) => selected.includes(c.employee.id))
                ? 'Снять всех'
                : `Выбрать всех (${selectable.length})`}
            </Button>
          </div>

          <div className="max-h-72 overflow-auto border border-border">
            {candidates.length === 0 ? (
              <p className="p-4 text-xs text-muted">
                {assignedIds.size > 0
                  ? 'Все подходящие сотрудники уже в проекте.'
                  : 'Сотрудники не найдены.'}
              </p>
            ) : (
              candidates.map(({ employee, peak, projected }) => {
                const overLimit = projected > limit;
                const overload = projected > 100;
                const checked = selected.includes(employee.id);
                return (
                  <label
                    key={employee.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-xs last:border-0',
                      checked && 'bg-surface-2/60',
                      overLimit && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={overLimit}
                      onChange={() => toggle(employee.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{fullName(employee)}</span>
                      <span className="block truncate text-[10px] text-muted">
                        {departmentById.get(employee.departmentId)?.name ?? '—'}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-right text-[10px] text-muted">
                      <span className="block">пик {peak}%</span>
                      <span className={cn('block font-medium', overload ? 'text-danger' : 'text-fg')}>
                        {overLimit ? `перегруз ${projected}%` : `итог ${projected}%`}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-muted">
            Уже в проекте: {assignedIds.size}. Загрузка считается по пику за период назначения,
            поэтому будущие пересечения тоже учитываются.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
