import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { VacationBalanceView } from '@/shared/types';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

export function VacationBalanceDialog({
  open,
  onClose,
  employeeId,
  year,
  balance,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  year: number;
  balance?: VacationBalanceView;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [entitlement, setEntitlement] = useState(28);
  const [carryover, setCarryover] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEntitlement(balance?.entitlement ?? 28);
    setCarryover(balance?.carryover ?? 0);
  }, [open, balance]);

  const mutation = useMutation({
    mutationFn: () =>
      api.vacations.updateBalance(employeeId, { year, entitlement, carryover }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      toast.success('Остаток отпуска обновлён');
      onClose();
    },
    onError: (error) => toast.error('Не удалось сохранить остаток', getErrorMessage(error)),
  });

  const valid =
    Number.isFinite(entitlement) &&
    entitlement >= 0 &&
    entitlement <= 365 &&
    Number.isFinite(carryover) &&
    carryover >= 0 &&
    carryover <= 365;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Остаток отпуска"
      description={`Положено и перенос на ${year} год`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Положено дней" hint="Основной отпуск, по умолчанию 28">
          <Input
            type="number"
            min={0}
            max={365}
            value={entitlement}
            onChange={(event) => setEntitlement(Number(event.target.value))}
          />
        </Field>
        <Field label="Перенос с прошлого года">
          <Input
            type="number"
            min={0}
            max={365}
            value={carryover}
            onChange={(event) => setCarryover(Number(event.target.value))}
          />
        </Field>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted">
        Использованные и запланированные дни считаются автоматически по заявкам на отпуск.
      </p>
    </Dialog>
  );
}
