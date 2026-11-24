import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Position, PositionPayload } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { POSITION_FAMILIES, POSITION_GRADES, POSITION_GRADE_LABELS } from '@/shared/lib/enums';
import { formatMoney } from '@/shared/lib/utils';
import { PageHeader } from '@/shared/ui/page';
import { Badge, Card, EmptyState, Field, Input, Select } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog, Dialog } from '@/shared/ui/overlay';
import { Table, TBody, TD, TH, THead, TR } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

export function PositionsPage() {
  const { positions, employees, departmentById } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState<Position | null>(null);

  const sortedPositions = [...positions].sort((a, b) => {
    const departmentCompare = (departmentById.get(a.departmentId)?.name ?? '').localeCompare(
      departmentById.get(b.departmentId)?.name ?? '',
      'ru',
    );
    if (departmentCompare !== 0) return departmentCompare;
    const familyCompare = a.family.localeCompare(b.family, 'ru');
    if (familyCompare !== 0) return familyCompare;
    return a.grade - b.grade;
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.positions.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Должность удалена');
      setDeleting(null);
    },
    onError: (error) => toast.error('Не удалось удалить', getErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Справочники"
        title="Должности"
        description="Должности по подразделениям, веткам и грейдам"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Добавить должность
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {positions.length === 0 ? (
          <EmptyState title="Должностей нет" icon={Briefcase} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Должность</TH>
                <TH>Подразделение</TH>
                <TH>Ветка</TH>
                <TH>Грейд</TH>
                <TH>Вилка оклада</TH>
                <TH>Сотрудников</TH>
                <TH className="w-24 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {sortedPositions.map((position) => {
                const count = employees.filter(
                  (employee) =>
                    employee.positionId === position.id && employee.status !== 'dismissed',
                ).length;
                return (
                  <TR key={position.id}>
                    <TD className="text-xs font-semibold text-fg">{position.name}</TD>
                    <TD className="text-xs text-muted">
                      {departmentById.get(position.departmentId)?.name ?? '—'}
                    </TD>
                    <TD>
                      <Badge tone="neutral">{position.family}</Badge>
                    </TD>
                    <TD className="text-xs text-muted">
                      {position.grade} · {POSITION_GRADE_LABELS[position.grade] ?? '—'}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted">
                      {formatMoney(position.salaryMin)} — {formatMoney(position.salaryMax)}
                    </TD>
                    <TD className="text-xs font-medium text-fg">{count}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(position);
                            setFormOpen(true);
                          }}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                          title="Редактировать"
                        >
                          <Pencil className="size-4" />
                        </button>
                        {count === 0 ? (
                          <button
                            type="button"
                            onClick={() => setDeleting(position)}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-red-500/10 hover:text-danger"
                            title="Удалить"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <PositionFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        position={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        title="Удалить должность?"
        description={deleting?.name}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function PositionFormDialog({
  open,
  onClose,
  position,
}: {
  open: boolean;
  onClose: () => void;
  position: Position | null;
}) {
  const { departments } = useLookups();
  const role = useAuthStore((state) => state.user?.role);
  const canEditSalary = role === 'admin';
  const salaryLocked = Boolean(position) && !canEditSalary;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<PositionPayload>({
    name: '',
    departmentId: departments[0]?.id ?? '',
    family: POSITION_FAMILIES[0],
    grade: 1,
    salaryMin: 0,
    salaryMax: 0,
  });

  useEffect(() => {
    if (!open) return;
    setValues({
      name: position?.name ?? '',
      departmentId: position?.departmentId ?? departments[0]?.id ?? '',
      family: position?.family ?? POSITION_FAMILIES[0],
      grade: position?.grade ?? 1,
      salaryMin: position?.salaryMin ?? 0,
      salaryMax: position?.salaryMax ?? 0,
    });
  }, [open, position, departments]);

  const mutation = useMutation({
    mutationFn: () =>
      position ? api.positions.update(position.id, values) : api.positions.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(position ? 'Должность обновлена' : 'Должность создана');
      onClose();
    },
    onError: (error) => toast.error('Не удалось сохранить', getErrorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={position ? 'Редактирование должности' : 'Новая должность'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={
              !values.name.trim() ||
              !values.departmentId ||
              !values.family.trim() ||
              !Number.isInteger(values.grade) ||
              values.salaryMin > values.salaryMax
            }
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Название *">
          <Input
            value={values.name}
            onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Старший тестировщик"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Подразделение *">
            <Select
              value={values.departmentId}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, departmentId: event.target.value }))
              }
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ветка *" hint="Профессиональная ветка внутри подразделения">
            <Select
              value={values.family}
              onChange={(event) => setValues((prev) => ({ ...prev, family: event.target.value }))}
            >
              {POSITION_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Грейд *">
          <Select
            value={values.grade}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, grade: Number(event.target.value) }))
            }
          >
            {POSITION_GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {grade} · {POSITION_GRADE_LABELS[grade]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Оклад от, ₽" hint={salaryLocked ? 'Вилку изменяет администратор' : undefined}>
            <Input
              type="number"
              min={0}
              value={values.salaryMin}
              disabled={salaryLocked}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, salaryMin: Number(event.target.value) }))
              }
            />
          </Field>
          <Field
            label="Оклад до, ₽"
            hint={salaryLocked ? 'Вилку изменяет администратор' : undefined}
            error={
              values.salaryMin > values.salaryMax
                ? 'Максимум должен быть не меньше минимума'
                : undefined
            }
          >
            <Input
              type="number"
              min={0}
              value={values.salaryMax}
              disabled={salaryLocked}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, salaryMax: Number(event.target.value) }))
              }
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
