import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { AbsencePayload, Employee } from '@/shared/types';
import { absenceTypeMeta } from '@/shared/lib/meta';
import { ABSENCE_TYPES } from '@/shared/lib/enums';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { employeeOptionLabel, fullName, todayISO } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select, Textarea } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

const schema = z
  .object({
    employeeId: z.string().min(1, 'Выберите сотрудника'),
    type: z.enum(ABSENCE_TYPES),
    startDate: z.string().min(1, 'Укажите дату начала'),
    endDate: z.string().min(1, 'Укажите дату окончания'),
    reason: z.string().optional(),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: 'Дата окончания раньше даты начала',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof schema>;

export function AbsenceForm({
  open,
  onClose,
  defaultEmployeeId,
  employees: providedEmployees,
}: {
  open: boolean;
  onClose: () => void;
  defaultEmployeeId?: string;
  employees?: Employee[];
}) {
  const user = useAuthStore((state) => state.user);
  const { employees: allEmployees, departmentById } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();

  const employees =
    providedEmployees ??
    allEmployees.filter((employee) => employee.status !== 'dismissed');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: defaultEmployeeId ?? user?.employeeId ?? '',
      type: 'vacation',
      startDate: todayISO(),
      endDate: todayISO(),
      reason: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      employeeId: defaultEmployeeId ?? user?.employeeId ?? '',
      type: 'vacation',
      startDate: todayISO(),
      endDate: todayISO(),
      reason: '',
    });
  }, [open, defaultEmployeeId, user?.employeeId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.absences.create({ ...values, reason: values.reason || undefined } as AbsencePayload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Заявка создана', 'Она отправлена на согласование');
      onClose();
    },
    onError: (error) => toast.error('Не удалось создать заявку', getErrorMessage(error)),
  });

  const isSelf = user?.role === 'employee';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Новая заявка на отсутствие"
      description="Заявка будет отправлена на согласование руководителю или HR"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form="absence-form" loading={mutation.isPending}>
            Отправить
          </Button>
        </>
      }
    >
      <form
        id="absence-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field
          label="Сотрудник *"
          error={errors.employeeId?.message}
          className="sm:col-span-2"
          hint={isSelf ? 'Заявка создаётся на вашу карточку' : undefined}
        >
          <Select {...register('employeeId')} disabled={isSelf}>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employeeOptionLabel(
                  fullName(employee),
                  departmentById.get(employee.departmentId)?.name,
                )}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Тип отсутствия" error={errors.type?.message}>
          <Select {...register('type')}>
            {Object.entries(absenceTypeMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Дата начала *" error={errors.startDate?.message}>
          <Input type="date" {...register('startDate')} />
        </Field>
        <Field label="Дата окончания *" error={errors.endDate?.message}>
          <Input type="date" {...register('endDate')} />
        </Field>
        <Field label="Комментарий" error={errors.reason?.message} className="sm:col-span-2">
          <Textarea {...register('reason')} placeholder="Причина или дополнительная информация" />
        </Field>
      </form>
    </Dialog>
  );
}
