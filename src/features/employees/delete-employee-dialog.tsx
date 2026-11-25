import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Employee } from '@/shared/types';
import { useLookups } from '@/shared/hooks/use-lookups';
import { fullName } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/overlay';
import { useToast } from '@/shared/ui/toast';
import { TaskReassignBlock } from './task-reassign-block';

export function DeleteEmployeeDialog({
  employee,
  open,
  onClose,
}: {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
}) {
  const { employees, projectById } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reassignments, setReassignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setReassignments({});
  }, [open, employee?.id]);

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'delete', employee?.id],
    queryFn: () => api.tasks.list({ employeeId: employee!.id, status: 'todo' }),
    enabled: Boolean(open && employee),
  });
  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'delete'],
    queryFn: () => api.assignments.list(),
    enabled: Boolean(open && employee),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!employee) return;
      const selected = Object.entries(reassignments).filter(([, target]) => target);
      for (const [taskId, target] of selected) {
        await api.tasks.update(taskId, { employeeId: target });
      }
      await api.employees.remove(employee.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Сотрудник удалён');
      onClose();
    },
    onError: (error) => toast.error('Не удалось удалить', getErrorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Удалить сотрудника?"
      description={employee ? fullName(employee) : undefined}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>
            Удалить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-danger/30 px-3 py-2 text-xs leading-5 text-danger">
          Удаление необратимо: пропадут связанные задачи, назначения, отсутствия, события
          и табель. Для увольнения используйте статус «Уволен».
        </div>
        {employee ? (
          <TaskReassignBlock
            tasks={tasksQuery.data ?? []}
            assignments={assignmentsQuery.data ?? []}
            employees={employees}
            projectById={projectById}
            excludeEmployeeId={employee.id}
            value={reassignments}
            onChange={(taskId, target) =>
              setReassignments((previous) => ({ ...previous, [taskId]: target }))
            }
            mode="delete"
          />
        ) : null}
      </div>
    </Dialog>
  );
}
