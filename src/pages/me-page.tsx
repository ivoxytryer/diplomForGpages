import { UserRoundX } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { Card, EmptyState } from '@/shared/ui/primitives';
import { EmployeePage } from './employee-page';

export function MePage() {
  const user = useAuthStore((state) => state.user);

  if (!user?.employeeId) {
    return (
      <Card>
        <EmptyState
          title="Карточка не привязана"
          description="Учётная запись не связана с карточкой сотрудника. Обратитесь к администратору или в HR-отдел."
          icon={UserRoundX}
        />
      </Card>
    );
  }

  return <EmployeePage employeeId={user.employeeId} />;
}
