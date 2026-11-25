/**
 * HTTP-слой мок-бэкенда. Роуты сгруппированы по доменам, порядок важен:
 * более конкретные пути должны идти раньше параметрических
 * (`/users/by-employee/:id` до `/users/:id`, `/timesheet/:id/status` до `/:date`).
 *
 * В будущем FastAPI каждый файл соответствует `app/api/v1/<domain>.py`,
 * а правила живут в `src/mocks/domain/*` → `app/services/*`.
 */
import { authHandlers } from './auth';
import { notificationHandlers } from './notifications';
import { dashboardHandlers } from './dashboard';
import { employeeHandlers } from './employees';
import { departmentHandlers } from './departments';
import { positionHandlers } from './positions';
import { projectHandlers } from './projects';
import { assignmentHandlers } from './assignments';
import { taskHandlers } from './tasks';
import { timesheetHandlers } from './timesheet';
import { vacationHandlers } from './vacations';
import { absenceHandlers } from './absences';
import { eventHandlers } from './events';
import { userHandlers } from './users';
import { auditHandlers } from './audit';
import { demoHandlers } from './demo';

export const handlers = [
  ...authHandlers,
  ...notificationHandlers,
  ...dashboardHandlers,
  ...employeeHandlers,
  ...departmentHandlers,
  ...positionHandlers,
  ...projectHandlers,
  ...assignmentHandlers,
  ...taskHandlers,
  ...timesheetHandlers,
  ...vacationHandlers,
  ...absenceHandlers,
  ...eventHandlers,
  ...userHandlers,
  ...auditHandlers,
  ...demoHandlers,
];
