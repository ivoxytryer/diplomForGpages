import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { ProjectTask } from '@/shared/types';
import { formatDate } from '@/shared/lib/utils';
import { useToast } from '@/shared/ui/toast';

/**
 * Общие действия над задачами: выполнить/вернуть, перенести, удалить.
 * Используется на странице задач, в карточке проекта и карточке сотрудника.
 */
export function useTaskActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
    queryClient.invalidateQueries({ queryKey: ['employee'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const toggle = useMutation({
    mutationFn: ({ task, done }: { task: ProjectTask; done: boolean }) => {
      setBusyId(task.id);
      return api.tasks.update(task.id, { status: done ? 'done' : 'todo' });
    },
    onSuccess: (updated) => {
      invalidate();
      toast.success(
        updated.status === 'done' ? 'Задача отмечена выполненной' : 'Задача возвращена в работу',
        updated.title,
      );
    },
    onError: (error) => toast.error('Не удалось обновить задачу', getErrorMessage(error)),
    onSettled: () => setBusyId(null),
  });

  const postpone = useMutation({
    mutationFn: (task: ProjectTask) => {
      setBusyId(task.id);
      return api.tasks.update(task.id, { postpone: true });
    },
    onSuccess: (updated) => {
      invalidate();
      toast.success(
        'Задача перенесена на следующий рабочий день',
        `Новый срок: ${formatDate(updated.dueDate)}`,
      );
    },
    onError: (error) => toast.error('Не удалось перенести задачу', getErrorMessage(error)),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (task: ProjectTask) => {
      setBusyId(task.id);
      return api.tasks.remove(task.id);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Задача удалена');
    },
    onError: (error) => toast.error('Не удалось удалить задачу', getErrorMessage(error)),
    onSettled: () => setBusyId(null),
  });

  return { busyId, invalidate, toggle, postpone, remove };
}
