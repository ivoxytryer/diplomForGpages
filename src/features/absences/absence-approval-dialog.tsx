import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Absence, AbsenceTaskDecision, TaskHandoverTask } from '@/shared/types';
import { useLookups } from '@/shared/hooks/use-lookups';
import { absenceTypeMeta } from '@/shared/lib/meta';
import { formatDate } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

/**
 * Согласование отсутствия. Задачи больше не блокируют согласование:
 * по каждой можно решить — оставить сотруднику или передать коллеге.
 * Для больничного/командировки по умолчанию предлагаем передачу.
 */
export function AbsenceApprovalDialog({
  open,
  absence,
  onClose,
  onApproved,
}: {
  open: boolean;
  absence: Absence | null;
  onClose: () => void;
  onApproved: () => void;
}) {
  const { projectById } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [decisions, setDecisions] = useState<Record<string, AbsenceTaskDecision>>({});

  const handoverQuery = useQuery({
    queryKey: ['absence', absence?.id, 'task-handover'],
    queryFn: () => api.absences.taskHandover(absence!.id),
    enabled: open && Boolean(absence),
  });

  useEffect(() => {
    if (!open) setDecisions({});
  }, [open, absence?.id]);

  const tasks = useMemo<TaskHandoverTask[]>(
    () => handoverQuery.data?.tasks ?? [],
    [handoverQuery.data],
  );

  useEffect(() => {
    if (!absence || !handoverQuery.data) return;
    setDecisions((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const { task, candidates } of handoverQuery.data.tasks) {
        if (next[task.id]) continue;
        const preferReassign =
          (absence.type === 'sick' || absence.type === 'business_trip') && candidates.length > 0;
        next[task.id] = {
          taskId: task.id,
          action: preferReassign ? 'reassign' : 'keep',
          employeeId: preferReassign ? candidates[0].employeeId : undefined,
        };
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [absence, handoverQuery.data]);

  const updateDecision = (taskId: string, patch: Partial<AbsenceTaskDecision>) => {
    setDecisions((previous) => ({
      ...previous,
      [taskId]: { ...(previous[taskId] ?? { taskId, action: 'keep' }), ...patch },
    }));
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.absences.setStatus(absence!.id, 'approved', Object.values(decisions)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Отсутствие согласовано');
      onApproved();
      onClose();
    },
    onError: (error) => toast.error('Не удалось согласовать', getErrorMessage(error)),
  });

  const valid = Boolean(
    absence &&
      !handoverQuery.isLoading &&
      tasks.every(({ task, candidates }) => {
        const decision = decisions[task.id];
        if (!decision) return false;
        if (decision.action === 'keep') return true;
        return Boolean(
          decision.employeeId && candidates.some((item) => item.employeeId === decision.employeeId),
        );
      }),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Согласование отсутствия"
      description={
        absence
          ? `${absenceTypeMeta[absence.type].label} · ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}`
          : undefined
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
            Согласовать
          </Button>
        </>
      }
    >
      {handoverQuery.isLoading ? (
        <p className="text-sm text-muted">Загружаем активные задачи…</p>
      ) : handoverQuery.isError ? (
        <p className="text-sm text-danger">{getErrorMessage(handoverQuery.error)}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted">
          Активных задач у сотрудника нет — можно согласовать без переназначения.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-muted">
            Задачи не блокируют согласование. Решите по каждой: оставить сотруднику или передать
            коллеге. Кандидаты — только участники проекта без согласованного отсутствия и с
            загрузкой меньше 100%.
          </p>
          {tasks.map(({ task, candidates }) => {
            const decision = decisions[task.id] ?? { taskId: task.id, action: 'keep' };
            const project = projectById.get(task.projectId);
            return (
              <div key={task.id} className="border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{task.title}</p>
                    <p className="text-[11px] text-muted">
                      {project ? `${project.code} · ${project.name}` : task.projectId} · срок{' '}
                      {formatDate(task.dueDate)}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted">
                    {task.estimateHours ? `${task.estimateHours} ч` : ''}
                  </span>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-[190px_1fr]">
                  <Field label="Решение">
                    <Select
                      value={decision.action}
                      onChange={(event) =>
                        updateDecision(task.id, {
                          action: event.target.value as 'keep' | 'reassign',
                          employeeId: undefined,
                        })
                      }
                    >
                      <option value="keep">Оставить сотруднику</option>
                      <option value="reassign" disabled={candidates.length === 0}>
                        Передать другому
                      </option>
                    </Select>
                  </Field>

                  {decision.action === 'reassign' ? (
                    <Field label="Новый исполнитель">
                      {candidates.length > 0 ? (
                        <Select
                          value={decision.employeeId ?? ''}
                          onChange={(event) =>
                            updateDecision(task.id, { employeeId: event.target.value })
                          }
                        >
                          <option value="">Выберите сотрудника</option>
                          {candidates.map((candidate) => (
                            <option key={candidate.employeeId} value={candidate.employeeId}>
                              {candidate.employeeName}
                              {candidate.projectRole ? ` · ${candidate.projectRole}` : ''} · загрузка{' '}
                              {candidate.load}%
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <p className="text-xs text-muted">
                          Нет доступных участников проекта — оставьте задачу сотруднику.
                        </p>
                      )}
                    </Field>
                  ) : (
                    <Field label="Комментарий" hint="Необязательно">
                      <Input
                        value={decision.comment ?? ''}
                        onChange={(event) =>
                          updateDecision(task.id, { comment: event.target.value })
                        }
                        placeholder="Например: работает удалённо"
                      />
                    </Field>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
