import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, ShieldAlert } from 'lucide-react';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { useToast } from '@/shared/ui/toast';

export function CredentialsDialog({
  open,
  onClose,
  email,
  password,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  password: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open, email, password]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nВременный пароль: ${password}`);
      setCopied(true);
      toast.success('Данные для входа скопированы');
    } catch {
      toast.error('Не удалось скопировать', 'Выделите данные вручную');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Учётная запись создана"
      description="Передайте сотруднику данные для первого входа."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
          <Button onClick={onClose}>Готово</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Временный пароль показывается один раз. При первом входе сотрудник обязан сменить
            его на постоянный.
          </p>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Email</p>
            <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm text-fg">
              {email}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Временный пароль
            </p>
            <p className="mt-1 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm text-fg">
              <KeyRound className="size-4 shrink-0 text-primary" />
              <span className="select-all break-all">{password}</span>
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
