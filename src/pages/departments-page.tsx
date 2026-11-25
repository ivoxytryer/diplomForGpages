import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Department, DepartmentPayload } from '@/shared/types';
import { useLookups } from '@/shared/hooks/use-lookups';
import { fullName } from '@/shared/lib/utils';
import { PageHeader } from '@/shared/ui/page';
import { Badge, Card, EmptyState, Field, Input, Select, Textarea } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Dialog, ConfirmDialog } from '@/shared/ui/overlay';
import { Table, TBody, TD, TH, THead, TR } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

function flattenTree(
  departments: Department[],
  parentId: string | null = null,
  depth = 0,
): { department: Department; depth: number }[] {
  return departments
    .filter((department) => (department.parentId ?? null) === parentId)
    .flatMap((department) => [
      { department, depth },
      ...flattenTree(departments, department.id, depth + 1),
    ]);
}

function descendantIds(departments: Department[], departmentId: string) {
  const ids = new Set<string>();
  const walk = (parentId: string) => {
    departments
      .filter((department) => department.parentId === parentId)
      .forEach((department) => {
        if (ids.has(department.id)) return;
        ids.add(department.id);
        walk(department.id);
      });
  };
  walk(departmentId);
  return ids;
}

export function DepartmentsPage() {
  const { departments, employees } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Department | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const rows = useMemo(() => {
    const tree = flattenTree(departments);
    const known = new Set(tree.map((item) => item.department.id));
    const orphans = departments
      .filter((department) => !known.has(department.id))
      .map((department) => ({ department, depth: 0 }));
    return [...tree, ...orphans];
  }, [departments]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.departments.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Подразделение удалено');
      setDeleting(null);
    },
    onError: (error) => toast.error('Не удалось удалить', getErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Справочники"
        title="Подразделения"
        description="Иерархия организационной структуры и руководители"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Добавить подразделение
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Подразделений нет" icon={Network} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Подразделение</TH>
                <TH>Код</TH>
                <TH>Руководитель</TH>
                <TH>Сотрудников</TH>
                <TH>Родительское</TH>
                <TH className="w-24 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map(({ department, depth }) => {
                const head = employees.find((employee) => employee.id === department.headId);
                const parent = departments.find((item) => item.id === department.parentId);
                const count = employees.filter(
                  (employee) =>
                    employee.departmentId === department.id && employee.status !== 'dismissed',
                ).length;
                return (
                  <TR key={department.id}>
                    <TD>
                      <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-2">
                        {depth > 0 ? <span className="text-muted">└</span> : null}
                        <div>
                          <p className="text-xs font-semibold text-fg">{department.name}</p>
                          {department.description ? (
                            <p className="text-[11px] text-muted">{department.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone="neutral">{department.code}</Badge>
                    </TD>
                    <TD className="text-xs text-muted">{head ? fullName(head) : '—'}</TD>
                    <TD className="text-xs font-medium text-fg">{count}</TD>
                    <TD className="text-xs text-muted">{parent?.name ?? '—'}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(department);
                            setFormOpen(true);
                          }}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                          title="Редактировать"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(department)}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-red-500/10 hover:text-danger"
                          title="Удалить"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <DepartmentFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        department={editing}
        departments={departments}
        employees={employees}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        title="Удалить подразделение?"
        description={deleting?.name}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function DepartmentFormDialog({
  open,
  onClose,
  department,
  departments,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  department: Department | null;
  departments: Department[];
  employees: { id: string; lastName: string; firstName: string; status: string }[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<DepartmentPayload>({
    name: '',
    code: '',
    parentId: null,
    headId: null,
    description: '',
  });

  useEffect(() => {
    if (!open) return;
    setValues({
      name: department?.name ?? '',
      code: department?.code ?? '',
      parentId: department?.parentId ?? null,
      headId: department?.headId ?? null,
      description: department?.description ?? '',
    });
  }, [open, department]);

  const unavailableParents = department
    ? descendantIds(departments, department.id)
    : new Set<string>();

  const mutation = useMutation({
    mutationFn: () =>
      department
        ? api.departments.update(department.id, values)
        : api.departments.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success(department ? 'Подразделение обновлено' : 'Подразделение создано');
      onClose();
    },
    onError: (error) => toast.error('Не удалось сохранить', getErrorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={department ? 'Редактирование подразделения' : 'Новое подразделение'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!values.name.trim() || !values.code.trim()}
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
            placeholder="Отдел разработки"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Код *">
            <Input
              value={values.code}
              onChange={(event) => setValues((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="DEV"
            />
          </Field>
          <Field label="Родительское подразделение">
            <Select
              value={values.parentId ?? ''}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, parentId: event.target.value || null }))
              }
            >
              <option value="">Верхний уровень</option>
              {departments
                .filter((item) => item.id !== department?.id && !unavailableParents.has(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Field label="Руководитель">
          <Select
            value={values.headId ?? ''}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, headId: event.target.value || null }))
            }
          >
            <option value="">Не назначен</option>
            {employees
              .filter((employee) => employee.status !== 'dismissed')
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.lastName} {employee.firstName}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Описание">
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Краткое описание функций подразделения"
          />
        </Field>
      </div>
    </Dialog>
  );
}
