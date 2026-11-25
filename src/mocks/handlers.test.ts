import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import dayjs from 'dayjs';
import { handlers } from './handlers';
import { MemoryStorage } from '@/test/memory-storage';
import { monthKey, todayISO } from '@/shared/lib/utils';

const BASE = 'http://localhost/api/v1';

/**
 * В MSW 2.7 в Node относительные пути обработчиков не совпадают с URL запросов
 * (resolutionContext.baseUrl заполняется только в браузере). Приводим пути
 * обработчиков к абсолютным URL для тестового процесса.
 */
handlers.forEach((handler) => {
  const { path } = handler.info;
  if (typeof path === 'string' && path.startsWith('/')) {
    handler.info.path = `http://localhost${path}`;
  }
});

const server = setupServer(...handlers);

beforeAll(() => {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

async function call(
  method: string,
  url: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: Record<string, unknown> | Record<string, unknown>[] | null }> {
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null;
  return { status: response.status, data };
}

async function login(email: string, password = 'demo1234') {
  const result = await call('POST', '/auth/login', { email, password });
  expect(result.status).toBe(200);
  const data = result.data as { token: string; user: { id: string; role: string } };
  return { token: data.token, user: data.user };
}

function asItem(data: unknown) {
  return data as Record<string, unknown>;
}

function asArray(data: unknown) {
  return data as Record<string, unknown>[];
}

/** Перед увольнением задачи и проекты сотрудника должны быть переназначены. */
async function reassignTasks(employeeId: string, token: string) {
  const tasks = asArray(
    (await call('GET', `/tasks?employeeId=${employeeId}`, undefined, token)).data,
  );
  const assignments = asArray((await call('GET', '/assignments', undefined, token)).data);
  const employeesPage = (await call('GET', '/employees?pageSize=500', undefined, token))
    .data as { items: Record<string, unknown>[] };
  const employees = employeesPage.items ?? [];
  for (const task of tasks) {
    if (task.status === 'done') continue;
    const candidate = assignments.find(
      (assignment) =>
        assignment.projectId === task.projectId &&
        assignment.employeeId !== employeeId &&
        employees.find((employee) => employee.id === assignment.employeeId)?.status !==
          'dismissed',
    );
    if (!candidate) continue;
    await call(
      'PATCH',
      `/tasks/${task.id}`,
      { employeeId: candidate.employeeId },
      token,
    );
  }
}

async function reassignProjects(employeeId: string, targetId: string, token: string) {
  const projects = asArray((await call('GET', '/projects', undefined, token)).data);
  for (const project of projects) {
    if (project.managerId !== employeeId) continue;
    await call('PATCH', `/projects/${project.id}`, { managerId: targetId }, token);
  }
}

async function prepareDismissal(employeeId: string, targetId: string, token: string) {
  await reassignTasks(employeeId, token);
  await reassignProjects(employeeId, targetId, token);
}

describe('auth', () => {
  it('отклоняет неверный пароль', async () => {
    const result = await call('POST', '/auth/login', { email: 'admin@hr.local', password: 'wrong' });
    expect(result.status).toBe(401);
  });

  it('не пускает заблокированного пользователя', async () => {
    const admin = await login('admin@hr.local');
    const users = await call('GET', '/users', undefined, admin.token);
    const sales = asArray(users.data).find((item) => item.email === 'sales@hr.local')!;
    const blocked = await call(
      'PATCH',
      `/users/${sales.id}`,
      { isActive: false },
      admin.token,
    );
    expect(blocked.status).toBe(200);
    const result = await call('POST', '/auth/login', { email: 'sales@hr.local', password: 'demo1234' });
    expect(result.status).toBe(403);
  });

  it('выдаёт токен вида mock-<userId>', async () => {
    const admin = await login('admin@hr.local');
    expect(admin.token).toBe('mock-u1');
  });
});

describe('права на запись', () => {
  it('требует сессию для изменений', async () => {
    expect((await call('POST', '/employees', {})).status).toBe(401);
    expect((await call('GET', '/audit')).status).toBe(401);
    expect((await call('DELETE', '/projects/pr1')).status).toBe(401);
  });

  it('требует сессию для чтения', async () => {
    for (const url of [
      '/employees',
      '/employees/e004',
      '/absences',
      '/timesheet',
      '/events',
      '/projects',
      '/assignments',
      '/dashboard',
      '/notifications',
      '/vacations/balance',
    ]) {
      expect((await call('GET', url)).status, url).toBe(401);
    }
  });

  it('сотрудник не может менять карточки, табель и заявки других', async () => {
    const employee = await login('employee@hr.local');
    const today = todayISO();

    expect(
      (await call('POST', '/employees', { lastName: 'Хакер' }, employee.token)).status,
    ).toBe(403);
    expect(
      (await call('PATCH', `/timesheet/${'e004'}/${today}`, { code: 'Я', hours: 8 }, employee.token)).status,
    ).toBe(403);
    expect(
      (await call('PATCH', `/timesheet/${'e004'}/status`, { month: monthKey(), status: 'approved' }, employee.token)).status,
    ).toBe(403);
    expect((await call('POST', '/events', { employeeId: 'e004', type: 'transfer' }, employee.token)).status).toBe(
      403,
    );
    expect((await call('GET', '/audit', undefined, employee.token)).status).toBe(403);
  });

  it('сотрудник может создать собственную заявку, но не согласовать её', async () => {
    const employee = await login('employee@hr.local');
    const today = todayISO();
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: today, endDate: today },
      employee.token,
    );
    expect(created.status).toBe(201);
    const absence = asItem(created.data);
    expect((await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, employee.token)).status).toBe(
      403,
    );

    // Свою заявку в статусе «На согласовании» сотрудник может править и удалить.
    const edited = await call(
      'PATCH',
      `/absences/${absence.id}`,
      { endDate: dayjs(today).add(1, 'day').format('YYYY-MM-DD') },
      employee.token,
    );
    expect(edited.status).toBe(200);
    expect((await call('DELETE', `/absences/${absence.id}`, undefined, employee.token)).status).toBe(200);
  });

  it('не позволяет подменить статус или сотрудника через PATCH заявки', async () => {
    const employee = await login('employee@hr.local');
    const today = todayISO();
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: today, endDate: today },
      employee.token,
    );
    expect(created.status).toBe(201);
    const id = asItem(created.data).id as string;

    const patched = await call(
      'PATCH',
      `/absences/${id}`,
      { status: 'approved', employeeId: 'e008' },
      employee.token,
    );
    expect(patched.status).toBe(200);
    expect(asItem(patched.data).status).toBe('pending');
    expect(asItem(patched.data).employeeId).toBe('e004');

    expect((await call('PATCH', `/absences/${id}`, { type: 'legacy' }, employee.token)).status).toBe(400);
  });

  it('сотрудник не правит чужие и согласованные заявки', async () => {
    const admin = await login('admin@hr.local');
    const employee = await login('employee@hr.local');
    const today = todayISO();

    // Чужая заявка на согласовании (e008).
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e008', type: 'vacation', startDate: today, endDate: today },
      admin.token,
    );
    const foreign = asItem(created.data);
    expect((await call('DELETE', `/absences/${foreign.id}`, undefined, employee.token)).status).toBe(403);
    expect((await call('PATCH', `/absences/${foreign.id}`, { reason: 'хак' }, employee.token)).status).toBe(403);

    // Своя согласованная заявка: e004 уже имеет утверждённый отпуск в следующем месяце.
    const approved = asArray((await call('GET', '/absences', undefined, employee.token)).data)
      .filter((item) => item.employeeId === 'e004' && item.status === 'approved');
    expect(approved.length).toBeGreaterThan(0);
    const ownApproved = approved[0];
    expect(
      (await call('PATCH', `/absences/${ownApproved.id}`, { reason: 'хак' }, employee.token)).status,
    ).toBe(400);
    expect((await call('DELETE', `/absences/${ownApproved.id}`, undefined, employee.token)).status).toBe(400);
  });

  it('руководитель не может менять карточки, но видит только свой оклад и может ставить задачи', async () => {
    const manager = await login('manager@hr.local');
    const today = todayISO();
    expect((await call('PATCH', '/employees/e004', { salary: 1 }, manager.token)).status).toBe(403);

    const ownCard = asItem((await call('GET', '/employees/e003', undefined, manager.token)).data);
    expect(ownCard.salary).toBeGreaterThan(0);
    const otherCard = asItem((await call('GET', '/employees/e004', undefined, manager.token)).data);
    expect(otherCard.salary).toBeUndefined();
    const list = ((await call('GET', '/employees?pageSize=500', undefined, manager.token)).data as {
      items: Array<{ id: string; salary?: number }>;
    }).items;
    expect(list.find((item) => item.id === 'e003')?.salary).toBeGreaterThan(0);
    expect(list.find((item) => item.id === 'e004')?.salary).toBeUndefined();

    const tsDate = `${monthKey()}-20`;
    expect(
      (await call('PATCH', `/timesheet/e004/${tsDate}`, { code: 'Я', hours: 8 }, manager.token))
        .status,
    ).toBe(403);

    const task = await call(
      'POST',
      '/tasks',
      { projectId: 'pr1', employeeId: 'e009', title: 'Новая задача', dueDate: today },
      manager.token,
    );
    expect(task.status).toBe(201);
  });

  it('руководитель видит каталог проектов, но не команду чужого проекта', async () => {
    const manager = await login('manager@hr.local');

    const projects = asArray((await call('GET', '/projects', undefined, manager.token)).data);
    expect(projects.length).toBeGreaterThan(3);
    expect(projects.some((project) => project.id === 'pr5')).toBe(true);

    // Карточку чужого проекта можно открыть для просмотра, ФИО руководителя видно.
    const foreignProject = asItem(
      (await call('GET', '/projects/pr5', undefined, manager.token)).data,
    );
    expect(foreignProject.managerId).toBe('e006');
    expect(typeof foreignProject.managerName).toBe('string');
    expect((foreignProject.managerName as string).length).toBeGreaterThan(0);

    // Команда чужого проекта скрыта.
    const foreignTeam = asArray(
      (await call('GET', '/assignments?projectId=pr5', undefined, manager.token)).data,
    );
    expect(foreignTeam).toHaveLength(0);

    // Команда своего проекта доступна.
    const ownTeam = asArray(
      (await call('GET', '/assignments?projectId=pr1', undefined, manager.token)).data,
    );
    expect(ownTeam.length).toBeGreaterThan(1);
  });

  it('руководитель передаёт свой проект и теряет к нему доступ', async () => {
    const manager = await login('manager@hr.local');
    const admin = await login('admin@hr.local');

    const project = asItem((await call('GET', '/projects/pr1', undefined, manager.token)).data);
    expect(project.managerId).toBe('e003');

    const transfer = await call('PATCH', '/projects/pr1', { managerId: 'e011' }, manager.token);
    expect(transfer.status).toBe(200);
    expect(asItem(transfer.data).managerId).toBe('e011');

    expect(
      (await call('PATCH', '/projects/pr1', { name: 'После передачи' }, manager.token)).status,
    ).toBe(403);
    expect(
      (await call('PATCH', '/projects/pr4', { managerId: 'e003' }, manager.token)).status,
    ).toBe(403);

    const restored = await call('PATCH', '/projects/pr1', { managerId: 'e003' }, admin.token);
    expect(restored.status).toBe(200);
  });

  it('ограничивает чтение сотрудников и табеля по роли', async () => {
    const employee = await login('employee@hr.local');
    const employeeList = (await call('GET', '/employees?pageSize=500', undefined, employee.token))
      .data as { items: Array<{ id: string }> };
    expect(employeeList.items.map((item) => item.id)).toEqual(['e004']);
    expect((await call('GET', '/employees/e004', undefined, employee.token)).status).toBe(200);
    expect((await call('GET', '/employees/e003', undefined, employee.token)).status).toBe(403);
    expect((await call('GET', '/employees/e008', undefined, employee.token)).status).toBe(403);
    expect(
      (await call('GET', `/timesheet?month=${monthKey()}&employeeId=e008`, undefined, employee.token))
        .status,
    ).toBe(403);

    const manager = await login('manager@hr.local');
    expect((await call('GET', '/employees/e009', undefined, manager.token)).status).toBe(200);
    expect((await call('GET', '/employees/e008', undefined, manager.token)).status).toBe(403);
  });

  it('не меняет организационные поля через PATCH карточки', async () => {
    const admin = await login('admin@hr.local');

    expect(
      (await call('PATCH', '/employees/e004', { departmentId: 'd2' }, admin.token)).status,
    ).toBe(400);
    expect(
      (await call('PATCH', '/employees/e004', { salary: 123456 }, admin.token)).status,
    ).toBe(400);
    const personal = await call(
      'PATCH',
      '/employees/e004',
      { firstName: 'Анна', phone: '+7 900 000-00-04' },
      admin.token,
    );
    expect(personal.status).toBe(200);
    expect(asItem(personal.data).firstName).toBe('Анна');
  });

  it('HR не создаёт задачи и не управляет пользователями', async () => {
    const hr = await login('hr@hr.local');
    const today = todayISO();
    expect(
      (await call('POST', '/tasks', { projectId: 'pr1', employeeId: 'e009', title: 'T', dueDate: today }, hr.token)).status,
    ).toBe(403);
    expect((await call('PATCH', '/users/u4', { role: 'admin' }, hr.token)).status).toBe(403);
    expect((await call('POST', '/users', { role: 'manager', email: 'm@hr.local' }, hr.token)).status).toBe(403);
  });
});

describe('отсутствия и статус сотрудника', () => {
  it('согласование отпуска ставит статус «В отпуске», удаление заявки сбрасывает его', async () => {
    const admin = await login('admin@hr.local');
    const today = todayISO();
    const end = dayjs(today).add(2, 'day').format('YYYY-MM-DD');

    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: today, endDate: end },
      admin.token,
    );
    expect(created.status).toBe(201);
    const absence = asItem(created.data);

    const approved = await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, admin.token);
    expect(approved.status).toBe(200);
    let employee = asItem((await call('GET', '/employees/e004', undefined, admin.token)).data);
    expect(employee.status).toBe('vacation');

    const blockedDelete = await call('DELETE', `/absences/${absence.id}`, undefined, admin.token);
    expect(blockedDelete.status).toBe(400);

    await call('PATCH', `/absences/${absence.id}/status`, { status: 'rejected' }, admin.token);
    employee = asItem((await call('GET', '/employees/e004', undefined, admin.token)).data);
    expect(employee.status).toBe('active');

    const removed = await call('DELETE', `/absences/${absence.id}`, undefined, admin.token);
    expect(removed.status).toBe(200);
    employee = asItem((await call('GET', '/employees/e004', undefined, admin.token)).data);
    expect(employee.status).toBe('active');
  });

  it('согласованное отсутствие перекрывает ручную правку табеля', async () => {
    const admin = await login('admin@hr.local');
    let date = dayjs().startOf('month').add(9, 'day');
    while (date.day() === 0 || date.day() === 6) date = date.add(1, 'day');
    const value = date.format('YYYY-MM-DD');
    const month = value.slice(0, 7);

    expect(
      (await call('PATCH', `/timesheet/e004/${value}`, { code: 'Н', hours: 0 }, admin.token))
        .status,
    ).toBe(200);

    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: value, endDate: value },
      admin.token,
    );
    expect(created.status).toBe(201);
    expect(
      (
        await call(
          'PATCH',
          `/absences/${asItem(created.data).id}/status`,
          { status: 'approved' },
          admin.token,
        )
      ).status,
    ).toBe(200);

    const timesheet = asItem(
      (await call('GET', `/timesheet?month=${month}&employeeId=e004`, undefined, admin.token)).data,
    ) as { rows: Array<{ days: Array<{ date: string; code?: string; isOverride?: boolean }> }> };
    const row = timesheet.rows[0];
    const day = row.days.find((item) => item.date === value);
    expect(day?.code).toBe('ОТ');
    expect(day?.isOverride).toBe(false);
  });

  it('командировка не меняет статус сотрудника', async () => {
    const admin = await login('admin@hr.local');
    const today = todayISO();
    const end = dayjs(today).add(1, 'day').format('YYYY-MM-DD');

    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e005', type: 'business_trip', startDate: today, endDate: end },
      admin.token,
    );
    const absence = asItem(created.data);
    await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, admin.token);

    const employee = asItem((await call('GET', '/employees/e005', undefined, admin.token)).data);
    expect(employee.status).toBe('active');
  });

  it('руководитель согласует только своё подразделение и дочерние', async () => {
    const admin = await login('admin@hr.local');
    const manager = await login('manager@hr.local');
    const start = dayjs().add(3, 'month').startOf('month').add(9, 'day').format('YYYY-MM-DD');

    const ownScope = await call(
      'POST',
      '/absences',
      { employeeId: 'e009', type: 'vacation', startDate: start, endDate: start },
      admin.token,
    );
    expect(ownScope.status).toBe(201);
    expect(
      (await call('PATCH', `/absences/${asItem(ownScope.data).id}/status`, { status: 'approved' }, manager.token))
        .status,
    ).toBe(200);

    const foreignScope = await call(
      'POST',
      '/absences',
      { employeeId: 'e008', type: 'vacation', startDate: start, endDate: start },
      admin.token,
    );
    expect(foreignScope.status).toBe(201);
    expect(
      (await call('PATCH', `/absences/${asItem(foreignScope.data).id}/status`, { status: 'approved' }, manager.token))
        .status,
    ).toBe(403);
  });

  it('больничный может только подтвердить HR или администратор', async () => {
    const admin = await login('admin@hr.local');
    const hr = await login('hr@hr.local');
    const manager = await login('manager@hr.local');
    const date = dayjs().add(4, 'month').startOf('month').add(9, 'day').format('YYYY-MM-DD');
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'sick', startDate: date, endDate: date },
      admin.token,
    );
    expect(created.status).toBe(201);
    const absence = asItem(created.data);

    expect(
      (await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, manager.token))
        .status,
    ).toBe(403);

    const confirmed = await call(
      'PATCH',
      `/absences/${absence.id}/status`,
      { status: 'approved' },
      hr.token,
    );
    expect(confirmed.status).toBe(200);
    expect(asItem(confirmed.data).confirmedAt).toBeTruthy();
    expect(asItem(confirmed.data).status).toBe('approved');

    expect(
      (
        await call(
          'PATCH',
          `/absences/${absence.id}/status`,
          { status: 'rejected' },
          admin.token,
        )
      ).status,
    ).toBe(400);
  });

  it('запрещает пересекающиеся заявки', async () => {
    const admin = await login('admin@hr.local');
    const today = todayISO();
    const end = dayjs(today).add(3, 'day').format('YYYY-MM-DD');
    const first = await call(
      'POST',
      '/absences',
      { employeeId: 'e008', type: 'vacation', startDate: today, endDate: end },
      admin.token,
    );
    expect(first.status).toBe(201);
    const second = await call(
      'POST',
      '/absences',
      { employeeId: 'e008', type: 'sick', startDate: end, endDate: end },
      admin.token,
    );
    expect(second.status).toBe(400);
  });
});

describe('уведомления и остатки отпусков', () => {
  it('отдаёт уведомления пользователя и отмечает прочитанными', async () => {
    const hr = await login('hr@hr.local');
    const list = asArray((await call('GET', '/notifications', undefined, hr.token)).data);
    expect(list.length).toBeGreaterThan(0);
    const first = list[0];
    expect(
      (await call('PATCH', `/notifications/${first.id}/read`, {}, hr.token)).status,
    ).toBe(200);
    expect(
      (await call('PATCH', '/notifications/read-all', {}, hr.token)).status,
    ).toBe(200);
    const unread = asArray(
      (await call('GET', '/notifications?unread=true', undefined, hr.token)).data,
    );
    expect(unread).toHaveLength(0);
  });

  it('считает остаток отпуска и не даёт превысить его', async () => {
    const employee = await login('employee@hr.local');
    const year = Number(todayISO().slice(0, 4)) + 1;
    const balances = asArray(
      (
        await call(
          'GET',
          `/vacations/balance?year=${year}&employeeId=e004`,
          undefined,
          employee.token,
        )
      ).data,
    );
    expect(balances).toHaveLength(1);
    const balance = balances[0] as { remaining: number };
    expect(balance.remaining).toBe(28);

    const tooLong = await call(
      'POST',
      '/absences',
      {
        employeeId: 'e004',
        type: 'vacation',
        startDate: `${year}-01-01`,
        endDate: `${year}-03-31`,
      },
      employee.token,
    );
    expect(tooLong.status).toBe(400);

    const hr = await login('hr@hr.local');
    expect(
      (
        await call(
          'PATCH',
          '/vacations/balance/e004',
          { year, entitlement: 30, carryover: 2 },
          hr.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'PATCH',
          '/vacations/balance/e004',
          { year, entitlement: 40 },
          employee.token,
        )
      ).status,
    ).toBe(403);
  });
});

describe('кадровые события', () => {
  it('повторный приём сбрасывает дату увольнения', async () => {
    const admin = await login('admin@hr.local');
    const dismissed = asItem((await call('GET', '/employees/e017', undefined, admin.token)).data);
    expect(dismissed.status).toBe('dismissed');

    const event = await call(
      'POST',
      '/events',
      { employeeId: 'e017', type: 'hire', date: todayISO(), title: 'Повторный приём' },
      admin.token,
    );
    expect(event.status).toBe(201);

    const employee = asItem((await call('GET', '/employees/e017', undefined, admin.token)).data);
    expect(employee.status).toBe('active');
    expect(employee.dismissalDate).toBeNull();
  });
});

describe('табель', () => {
  it('валидирует код, часы, статус и месяц', async () => {
    const admin = await login('admin@hr.local');
    const month = monthKey();
    const date = `${month}-20`;

    expect((await call('PATCH', `/timesheet/e004/${date}`, { code: 'X', hours: 8 }, admin.token)).status).toBe(400);
    expect((await call('PATCH', `/timesheet/e004/${date}`, { code: 'Я', hours: -1 }, admin.token)).status).toBe(400);
    expect((await call('PATCH', `/timesheet/e004/${date}`, { code: 'Я', hours: 30 }, admin.token)).status).toBe(400);
    expect((await call('PATCH', `/timesheet/e004/${date}`, { code: '—', hours: 0 }, admin.token)).status).toBe(400);
    expect(
      (await call('PATCH', '/timesheet/e004/status', { month: '2026-13', status: 'draft' }, admin.token)).status,
    ).toBe(400);
    expect(
      (await call('PATCH', '/timesheet/e004/status', { month, status: 'weird' }, admin.token)).status,
    ).toBe(400);
  });

  it('разрешает админу править утверждённый табель, остальным — нет', async () => {
    const admin = await login('admin@hr.local');
    const hr = await login('hr@hr.local');
    const manager = await login('manager@hr.local');
    const month = monthKey();
    const date = `${month}-20`;
    await call('PATCH', '/timesheet/e004/status', { month, status: 'approved' }, admin.token);
    expect(
      (await call('PATCH', `/timesheet/e004/${date}`, { code: 'Б', hours: 0 }, hr.token)).status,
    ).toBe(400);
    expect(
      (await call('PATCH', `/timesheet/e004/${date}`, { code: 'Б', hours: 0 }, manager.token)).status,
    ).toBe(403);
    expect(
      (await call('PATCH', `/timesheet/e004/${date}`, { code: 'Б', hours: 0 }, admin.token)).status,
    ).toBe(200);
  });
});

describe('задачи', () => {
  it('сотрудник выполняет и переносит только свои задачи', async () => {
    const employee = await login('employee@hr.local');
    const today = todayISO();

    const list = asArray((await call('GET', '/tasks', undefined, employee.token)).data);
    const before = list.find((item) => item.id === 't001') ?? {};
    expect(before.status).toBe('todo');

    const postponed = await call('PATCH', '/tasks/t001', { postpone: true }, employee.token);
    expect(postponed.status).toBe(200);
    const afterPostpone = asItem(postponed.data);
    expect(afterPostpone.carryCount).toBe(1);
    expect(String(afterPostpone.dueDate) > today).toBe(true);

    const done = await call(
      'PATCH',
      '/tasks/t001',
      {
        status: 'done',
        completionComment: 'Подготовила макет и согласовала его с дизайнером.',
      },
      employee.token,
    );
    expect(done.status).toBe(200);
    expect(asItem(done.data).status).toBe('done');
    expect(asItem(done.data).completedAt).not.toBeNull();
    expect(asItem(done.data).completionComment).toContain('макет');
    expect((asItem(done.data).completionHistory as unknown[]).length).toBe(1);

    // Сотрудник не может менять содержимое задачи.
    expect((await call('PATCH', '/tasks/t001', { title: 'Хак' }, employee.token)).status).toBe(403);
    // И не может трогать чужие задачи.
    expect((await call('PATCH', '/tasks/t009', { status: 'done' }, employee.token)).status).toBe(403);
  });

  it('руководитель редактирует задачу, HR удалить не может', async () => {
    const manager = await login('manager@hr.local');
    const updated = await call('PATCH', '/tasks/t001', { title: 'Новое название', dueDate: todayISO() }, manager.token);
    expect(updated.status).toBe(200);
    expect(asItem(updated.data).title).toBe('Новое название');

    const hr = await login('hr@hr.local');
    expect((await call('DELETE', '/tasks/t001', undefined, hr.token)).status).toBe(403);
  });

  it('переназначает активную задачу только руководитель или администратор', async () => {
    const admin = await login('admin@hr.local');
    const employee = await login('employee@hr.local');
    const hr = await login('hr@hr.local');
    const tasks = asArray(
      (await call('GET', '/tasks?employeeId=e004', undefined, admin.token)).data,
    );
    const task = tasks.find((item) => item.status === 'todo');
    if (!task) throw new Error('Активная задача не найдена');
    const assignments = asArray(
      (await call('GET', `/assignments?projectId=${task.projectId}`, undefined, admin.token)).data,
    );
    const target = assignments.find(
      (assignment) => assignment.employeeId !== task.employeeId,
    );
    if (!target) throw new Error('Участник проекта для переназначения не найден');

    expect(
      (await call('PATCH', `/tasks/${task.id}`, { employeeId: target.employeeId }, employee.token))
        .status,
    ).toBe(403);
    expect(
      (await call('PATCH', `/tasks/${task.id}`, { employeeId: target.employeeId }, hr.token)).status,
    ).toBe(403);

    const updated = await call(
      'PATCH',
      `/tasks/${task.id}`,
      { employeeId: target.employeeId },
      admin.token,
    );
    expect(updated.status).toBe(200);
    expect(asItem(updated.data).employeeId).toBe(target.employeeId);

    expect(
      (await call('PATCH', `/tasks/${task.id}`, { employeeId: 'e999' }, admin.token)).status,
    ).toBe(404);
  });
});

describe('пользователи и пароли', () => {
  it('создаёт учётную запись с временным паролем и требует его смены', async () => {
    const admin = await login('admin@hr.local');
    const created = await call(
      'POST',
      '/users',
      { employeeId: 'e005', email: 'new.user@hr.local', role: 'employee' },
      admin.token,
    );
    expect(created.status).toBe(201);
    const response = asItem(created.data) as unknown as { temporaryPassword: string; user: { mustChangePassword: boolean } };
    expect(response.temporaryPassword).toHaveLength(12);
    expect(response.user.mustChangePassword).toBe(true);

    const firstLogin = await call('POST', '/auth/login', { email: 'new.user@hr.local', password: response.temporaryPassword });
    expect(firstLogin.status).toBe(200);

    const token = (asItem(firstLogin.data) as { token: string }).token;
    const changed = await call(
      'POST',
      '/auth/change-password',
      { currentPassword: response.temporaryPassword, newPassword: 'NewPass123!' },
      token,
    );
    expect(changed.status).toBe(200);
    expect(asItem(changed.data).mustChangePassword).toBe(false);

    expect(
      (await call('POST', '/auth/login', { email: 'new.user@hr.local', password: 'NewPass123!' })).status,
    ).toBe(200);
    expect(
      (await call('POST', '/auth/login', { email: 'new.user@hr.local', password: response.temporaryPassword })).status,
    ).toBe(401);
  });
});

describe('справочники и проекты', () => {
  it('не позволяет цикл в иерархии подразделений', async () => {
    const admin = await login('admin@hr.local');
    expect((await call('PATCH', '/departments/d1', { parentId: 'd2' }, admin.token)).status).toBe(400);
  });

  it('валидирует вилку оклада и дубли назначений', async () => {
    const admin = await login('admin@hr.local');
    expect(
      (
        await call(
          'POST',
          '/positions',
          {
            name: 'X',
            departmentId: 'd5',
            family: 'QA',
            grade: 1,
            salaryMin: 100,
            salaryMax: 50,
          },
          admin.token,
        )
      ).status,
    ).toBe(400);

    const duplicate = await call(
      'POST',
      '/assignments',
      { projectId: 'pr1', employeeId: 'e003', projectRole: 'Участник', allocation: 10, startDate: todayISO() },
      admin.token,
    );
    expect(duplicate.status).toBe(400);

    const invalid = await call(
      'POST',
      '/assignments',
      { projectId: 'pr1', employeeId: 'e009', projectRole: 'Участник', allocation: 150, startDate: todayISO() },
      admin.token,
    );
    expect(invalid.status).toBe(400);

    const hr = await login('hr@hr.local');
    expect(
      (await call('PATCH', '/positions/p2', { salaryMin: 100000 }, hr.token)).status,
    ).toBe(403);
    expect(
      (await call('PATCH', '/positions/p2', { name: 'HR-специалист' }, hr.token)).status,
    ).toBe(200);
    expect(
      (await call('PATCH', '/positions/p2', { salaryMin: 100000 }, admin.token)).status,
    ).toBe(200);
  });

  it('запрещает перегруз всем, кроме администратора с причиной', async () => {
    const admin = await login('admin@hr.local');
    const manager = await login('manager@hr.local');
    const assignment = {
      projectId: 'pr2',
      employeeId: 'e009',
      projectRole: 'Участник',
      allocation: 40,
      startDate: todayISO(),
    };

    // e009 уже загружен на 70%; 70 + 40 = 110%.
    expect((await call('POST', '/assignments', assignment, manager.token)).status).toBe(400);
    expect((await call('POST', '/assignments', assignment, admin.token)).status).toBe(400);

    const approved = await call(
      'POST',
      '/assignments',
      { ...assignment, overloadReason: 'Критичный срок релиза' },
      admin.token,
    );
    expect(approved.status).toBe(201);
    expect(asItem(approved.data).overloadReason).toBe('Критичный срок релиза');

    // 110 + 50 = 160%, выше администраторского предела 150%.
    expect(
      (
        await call(
          'POST',
          '/assignments',
          {
            projectId: 'pr3',
            employeeId: 'e009',
            projectRole: 'Участник',
            allocation: 50,
            startDate: todayISO(),
            overloadReason: 'Ещё один проект',
          },
          admin.token,
        )
      ).status,
    ).toBe(400);
  });
});

describe('лента событий и отсутствия', () => {
  it('согласование создаёт событие, отклонение удаляет его', async () => {
    const admin = await login('admin@hr.local');
    const today = todayISO();
    const end = dayjs(today).add(1, 'day').format('YYYY-MM-DD');

    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: today, endDate: end },
      admin.token,
    );
    const absence = asItem(created.data);

    let events = asArray((await call('GET', '/events?employeeId=e004', undefined, admin.token)).data);
    expect(events.some((event) => event.absenceId === absence.id)).toBe(false);

    await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, admin.token);
    events = asArray((await call('GET', '/events?employeeId=e004', undefined, admin.token)).data);
    const vacationEvent = events.find((event) => event.absenceId === absence.id);
    expect(vacationEvent).toBeTruthy();
    expect(vacationEvent?.type).toBe('vacation');
    expect(vacationEvent?.date).toBe(today);
    expect(String(vacationEvent?.title)).toContain('отпуск');

    // Повторное согласование не создаёт дубликат.
    await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, admin.token);
    events = asArray((await call('GET', '/events?employeeId=e004', undefined, admin.token)).data);
    expect(events.filter((event) => event.absenceId === absence.id)).toHaveLength(1);

    await call('PATCH', `/absences/${absence.id}/status`, { status: 'rejected' }, admin.token);
    events = asArray((await call('GET', '/events?employeeId=e004', undefined, admin.token)).data);
    expect(events.some((event) => event.absenceId === absence.id)).toBe(false);
  });

  it('согласует больничный и позволяет оставить или передать задачи', async () => {
    const admin = await login('admin@hr.local');
    const date = dayjs().add(2, 'month').startOf('month').add(9, 'day').format('YYYY-MM-DD');
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'sick', startDate: date, endDate: date },
      admin.token,
    );
    expect(created.status).toBe(201);
    const absence = asItem(created.data);

    const tasks = asArray(
      (await call('GET', '/tasks?employeeId=e004&status=todo', undefined, admin.token)).data,
    );
    const task = tasks.find((item) => item.projectId === 'pr1');
    if (!task) throw new Error('Активная задача e004 на pr1 не найдена');

    const handover = asItem(
      (await call('GET', `/absences/${absence.id}/task-handover`, undefined, admin.token)).data,
    ) as { tasks: Array<{ task: { id: string }; candidates: Array<{ employeeId: string }> }> };
    const handoverTask = handover.tasks.find((item) => item.task.id === task.id);
    expect(handoverTask).toBeTruthy();
    const candidate = handoverTask?.candidates[0];
    expect(candidate).toBeTruthy();

    const approved = await call(
      'PATCH',
      `/absences/${absence.id}/status`,
      {
        status: 'approved',
        taskDecisions: [
          { taskId: task.id, action: 'reassign', employeeId: candidate!.employeeId },
        ],
      },
      admin.token,
    );
    expect(approved.status).toBe(200);

    const updated = asArray(
      (await call('GET', '/tasks?employeeId=e004&status=todo', undefined, admin.token)).data,
    );
    expect(updated.some((item) => item.id === task.id)).toBe(false);
  });

  it('обновляет событие при изменении заявки и удаляет вместе с ней', async () => {
    const admin = await login('admin@hr.local');
    const today = todayISO();
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e005', type: 'business_trip', startDate: today, endDate: today },
      admin.token,
    );
    const absence = asItem(created.data);
    await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, admin.token);

    let events = asArray((await call('GET', '/events?employeeId=e005', undefined, admin.token)).data);
    expect(events.find((item) => item.absenceId === absence.id)?.type).toBe('business_trip');

    const newStart = dayjs(today).add(2, 'day').format('YYYY-MM-DD');
    const newEnd = dayjs(today).add(3, 'day').format('YYYY-MM-DD');
    expect(
      (await call('PATCH', `/absences/${absence.id}`, { startDate: newStart, endDate: newEnd }, admin.token))
        .status,
    ).toBe(400);
    expect(
      (await call('PATCH', `/absences/${absence.id}/status`, { status: 'pending' }, admin.token)).status,
    ).toBe(200);
    expect(
      (await call('PATCH', `/absences/${absence.id}`, { startDate: newStart, endDate: newEnd }, admin.token))
        .status,
    ).toBe(200);
    await call('PATCH', `/absences/${absence.id}/status`, { status: 'approved' }, admin.token);
    events = asArray((await call('GET', '/events?employeeId=e005', undefined, admin.token)).data);
    expect(events.find((item) => item.absenceId === absence.id)?.date).toBe(newStart);

    expect((await call('DELETE', `/absences/${absence.id}`, undefined, admin.token)).status).toBe(400);
    await call('PATCH', `/absences/${absence.id}/status`, { status: 'rejected' }, admin.token);
    expect((await call('DELETE', `/absences/${absence.id}`, undefined, admin.token)).status).toBe(200);
    events = asArray((await call('GET', '/events?employeeId=e005', undefined, admin.token)).data);
    expect(events.some((event) => event.absenceId === absence.id)).toBe(false);
  });

  it('в сид-данных есть события по больничным и командировкам', async () => {
    const admin = await login('admin@hr.local');
    const events = asArray((await call('GET', '/events', undefined, admin.token)).data);
    expect(events.some((event) => event.type === 'sick_leave')).toBe(true);
    expect(events.some((event) => event.type === 'business_trip')).toBe(true);
    const absenceTypes = ['vacation', 'sick_leave', 'business_trip', 'unpaid_leave'];
    events
      .filter((event) => absenceTypes.includes(String(event.type)))
      .forEach((event) => expect(event.absenceId).toBeTruthy());
  });
});

describe('дашборд, аудит и сброс', () => {
  it('отдаёт агрегаты дашборда', async () => {
    const admin = await login('admin@hr.local');
    const result = await call('GET', '/dashboard', undefined, admin.token);
    expect(result.status).toBe(200);
    const data = asItem(result.data);
    expect(Number(data.headcount)).toBeGreaterThan(0);
    expect(Number(data.pendingAbsences)).toBeGreaterThan(0);
  });

  it('не отдаёт дни рождения менеджеру', async () => {
    const manager = await login('manager@hr.local');
    const result = await call('GET', '/dashboard', undefined, manager.token);
    expect(result.status).toBe(200);
    expect(asArray(asItem(result.data).birthdays)).toHaveLength(0);
  });

  it('считает дашборд менеджера по той же области, что и список сотрудников', async () => {
    const manager = await login('manager@hr.local');
    const list = await call('GET', '/employees?pageSize=500', undefined, manager.token);
    const employees = asArray(asItem(list.data).items) as Array<{ status: string }>;
    const active = employees.filter((employee) => employee.status !== 'dismissed').length;

    const dashboard = await call('GET', '/dashboard', undefined, manager.token);
    expect(asItem(dashboard.data).headcount).toBe(active);
  });

  it('журнал действий доступен только администратору', async () => {
    const admin = await login('admin@hr.local');
    const audit = await call('GET', '/audit', undefined, admin.token);
    expect(audit.status).toBe(200);
    expect(asArray(audit.data).length).toBeGreaterThan(0);

    const hr = await login('hr@hr.local');
    expect((await call('GET', '/audit', undefined, hr.token)).status).toBe(403);
  });

  it('сброс демо-данных доступен только администратору', async () => {
    const admin = await login('admin@hr.local');
    expect((await call('POST', '/demo/reset', {}, admin.token)).status).toBe(200);

    const hr = await login('hr@hr.local');
    expect((await call('POST', '/demo/reset', {}, hr.token)).status).toBe(403);
  });
});

describe('должности и повышение', () => {
  it('все должности привязаны к подразделениям и грейдам', async () => {
    const admin = await login('admin@hr.local');
    const positions = (await call('GET', '/positions', undefined, admin.token)).data;
    const list = Array.isArray(positions) ? positions : [];
    expect(list.length).toBeGreaterThanOrEqual(21);
    list.forEach((position) => {
      const item = position as {
        departmentId?: string;
        family?: string;
        grade?: number;
      };
      expect(item.departmentId).toBeTruthy();
      expect(item.family).toBeTruthy();
      expect(item.grade).toBeGreaterThanOrEqual(1);
      expect(item.grade).toBeLessThanOrEqual(4);
    });

    const employees = (
      (await call('GET', '/employees?pageSize=500', undefined, admin.token)).data as {
        items: Array<{ departmentId: string; positionId: string }>;
      }
    ).items;
    for (const employee of employees) {
      const position = list.find(
        (item) => (item as { id: string }).id === employee.positionId,
      ) as { departmentId?: string } | undefined;
      expect(position?.departmentId).toBe(employee.departmentId);
    }
  });

  it('повышает только внутри подразделения и ветки, выше по грейду', async () => {
    const admin = await login('admin@hr.local');
    const base = {
      employeeId: 'e010',
      type: 'promotion',
      date: todayISO(),
      title: 'Повышение',
    };
    // e010 — Разработчик (Backend, грейд 2) в отделе разработки.
    expect((await call('POST', '/events', { ...base, toPositionId: 'p9' }, admin.token)).status).toBe(400);
    expect((await call('POST', '/events', { ...base, toPositionId: 'p4' }, admin.token)).status).toBe(400);
    expect((await call('POST', '/events', { ...base, toPositionId: 'p12' }, admin.token)).status).toBe(400);
    expect((await call('POST', '/events', { ...base, toPositionId: 'p14' }, admin.token)).status).toBe(201);
    expect(
      (await call('POST', '/events', { ...base, toPositionId: 'p11' }, admin.token)).status,
    ).toBe(400);
  });

  it('перевод требует должность из нового подразделения', async () => {
    const admin = await login('admin@hr.local');
    const base = {
      employeeId: 'e010',
      type: 'transfer',
      date: todayISO(),
      title: 'Перевод',
      toDepartmentId: 'd2',
    };
    expect((await call('POST', '/events', base, admin.token)).status).toBe(400);
    expect(
      (await call('POST', '/events', { ...base, toPositionId: 'p14' }, admin.token)).status,
    ).toBe(400);
    expect(
      (await call('POST', '/events', { ...base, toPositionId: 'p2' }, admin.token)).status,
    ).toBe(201);
  });

  it('валидирует и не удаляет занятые должности', async () => {
    const admin = await login('admin@hr.local');
    const created = await call(
      'POST',
      '/positions',
      {
        name: 'Инженер по качеству',
        departmentId: 'd5',
        family: 'QA',
        grade: 1,
        salaryMin: 70000,
        salaryMax: 100000,
      },
      admin.token,
    );
    expect(created.status).toBe(201);

    expect(
      (
        await call(
          'POST',
          '/positions',
          {
            name: 'Плохой грейд',
            departmentId: 'd5',
            family: 'QA',
            grade: 9,
            salaryMin: 1,
            salaryMax: 2,
          },
          admin.token,
        )
      ).status,
    ).toBe(400);

    expect((await call('DELETE', '/positions/p5', undefined, admin.token)).status).toBe(400);
  });
});

describe('валидация справочных значений', () => {
  it('отклоняет неизвестные статусы и типы на входе API', async () => {
    const admin = await login('admin@hr.local');
    const today = todayISO();

    expect((await call('PATCH', '/tasks/t001', { status: 'weird' }, admin.token)).status).toBe(400);
    expect((await call('POST', '/employees', { status: 'weird' }, admin.token)).status).toBe(400);
    expect((await call('PATCH', '/employees/e004', { status: 'weird' }, admin.token)).status).toBe(400);
    expect((await call('PATCH', '/projects/pr1', { status: 'weird' }, admin.token)).status).toBe(400);
    expect((await call('PATCH', '/users/u4', { role: 'weird' }, admin.token)).status).toBe(400);
    expect((await call('PATCH', '/users/u4', { isActive: 'false' }, admin.token)).status).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/absences',
          { employeeId: 'e004', type: 'weird', startDate: today, endDate: today },
          admin.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'weird', date: today, title: 'X' },
          admin.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'transfer', date: 'not-a-date', title: 'X' },
          admin.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'transfer', date: today, title: '' },
          admin.token,
        )
      ).status,
    ).toBe(400);

    expect(
      (await call('PATCH', '/timesheet/e004/2026-02-30', { code: 'Я', hours: 8 }, admin.token))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/tasks',
          {
            projectId: 'pr1',
            employeeId: 'e004',
            title: 'Плохая оценка',
            dueDate: today,
            estimateHours: 'abc' as unknown as number,
          },
          admin.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'PATCH',
          '/tasks/t001',
          { estimateHours: -5 },
          admin.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'hire', date: today, title: 'Повторный приём' },
          admin.token,
        )
      ).status,
    ).toBe(400);
  });
});

describe('синхронизация данных сотрудника и учётной записи', () => {
  it('меняет email учётной записи вместе с email карточки', async () => {
    const admin = await login('admin@hr.local');
    const created = await call(
      'POST',
      '/employees',
      {
        lastName: 'Синхронизация',
        firstName: 'Тест',
        birthDate: '1990-01-01',
        gender: 'male',
        email: 'sync.employee@hr.local',
        phone: '+7 900 000-00-00',
        departmentId: 'd5',
        positionId: 'p5',
        hireDate: '2026-01-01',
        status: 'active',
        employmentType: 'full',
        salary: 150000,
      },
      admin.token,
    );
    expect(created.status).toBe(201);
    const employee = asItem(created.data);

    const account = await call(
      'POST',
      '/users',
      {
        email: 'sync.employee@hr.local',
        name: 'Синхронизация Тест',
        role: 'employee',
        employeeId: employee.id,
      },
      admin.token,
    );
    expect(account.status).toBe(201);

    const updated = await call(
      'PATCH',
      `/employees/${employee.id}`,
      { email: 'sync.employee2@hr.local' },
      admin.token,
    );
    expect(updated.status).toBe(200);

    const user = asItem(
      (
        await call(
          'GET',
          `/users/by-employee/${employee.id}`,
          undefined,
          admin.token,
        )
      ).data,
    );
    expect(user.email).toBe('sync.employee2@hr.local');

    expect((await call('DELETE', `/employees/${employee.id}`, undefined, admin.token)).status).toBe(
      200,
    );
    const db = JSON.parse(localStorage.getItem('hr-system-db-v1') ?? '{}');
    expect(
      (db.vacationBalances ?? []).some(
        (item: { employeeId: string }) => item.employeeId === employee.id,
      ),
    ).toBe(false);
  });
});

describe('уточнённые права HR', () => {
  it('HR не удаляет и не увольняет сотрудников', async () => {
    const hr = await login('hr@hr.local');
    const admin = await login('admin@hr.local');

    expect((await call('DELETE', '/employees/e004', undefined, hr.token)).status).toBe(403);
    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'dismissal', date: todayISO(), title: 'Увольнение' },
          hr.token,
        )
      ).status,
    ).toBe(403);
    expect((await call('POST', '/employees', { status: 'dismissed' }, hr.token)).status).toBe(403);

    await prepareDismissal('e004', 'e012', admin.token);
    const dismissed = await call(
      'POST',
      '/events',
      { employeeId: 'e004', type: 'dismissal', date: todayISO(), title: 'Увольнение' },
      admin.token,
    );
    expect(dismissed.status).toBe(201);
    expect(asItem((await call('GET', '/employees/e004', undefined, admin.token)).data).status).toBe(
      'dismissed',
    );

    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'hire', date: todayISO(), title: 'Восстановление' },
          hr.token,
        )
      ).status,
    ).toBe(403);
    expect((await call('PATCH', '/employees/e004', { firstName: 'Анна' }, hr.token)).status).toBe(200);
    expect((await call('DELETE', '/employees/e004', undefined, admin.token)).status).toBe(200);
  });

  it('не увольняет, пока задачи и проекты не переданы', async () => {
    const admin = await login('admin@hr.local');

    const dismissal = { employeeId: 'e003', type: 'dismissal', date: todayISO(), title: 'Увольнение' };
    expect((await call('POST', '/events', dismissal, admin.token)).status).toBe(400);

    await reassignTasks('e003', admin.token);
    expect((await call('POST', '/events', dismissal, admin.token)).status).toBe(400);

    await reassignProjects('e003', 'e012', admin.token);
    const dismissed = await call('POST', '/events', dismissal, admin.token);
    expect(dismissed.status).toBe(201);
    const after = asArray((await call('GET', '/projects', undefined, admin.token)).data);
    expect(after.some((project) => project.managerId === 'e003')).toBe(false);
  });

  it('HR не оформляет повышение и перевод самому себе', async () => {
    const hr = await login('hr@hr.local');
    const promotion = {
      employeeId: 'e002',
      type: 'promotion',
      date: todayISO(),
      title: 'Повышение',
      toPositionId: 'p16',
    };
    const transfer = {
      employeeId: 'e002',
      type: 'transfer',
      date: todayISO(),
      title: 'Перевод',
      toDepartmentId: 'd3',
      toPositionId: 'p3',
    };

    expect((await call('POST', '/events', promotion, hr.token)).status).toBe(403);
    expect((await call('POST', '/events', transfer, hr.token)).status).toBe(403);

    // Других сотрудников HR по-прежнему может повышать.
    expect(
      (
        await call(
          'POST',
          '/events',
          {
            employeeId: 'e004',
            type: 'promotion',
            date: todayISO(),
            title: 'Повышение',
            toPositionId: 'p14',
          },
          hr.token,
        )
      ).status,
    ).toBe(201);
  });

  it('HR не создаёт событие увольнения', async () => {
    const hr = await login('hr@hr.local');
    const admin = await login('admin@hr.local');
    const payload = { employeeId: 'e004', type: 'dismissal', date: todayISO(), title: 'Увольнение' };

    expect((await call('POST', '/events', payload, hr.token)).status).toBe(403);
    await prepareDismissal('e004', 'e012', admin.token);
    expect((await call('POST', '/events', payload, admin.token)).status).toBe(201);
  });

  it('HR смотрит, утверждает и правит отметки табеля', async () => {
    const hr = await login('hr@hr.local');
    const admin = await login('admin@hr.local');
    const month = monthKey();
    const date = `${month}-20`;

    expect(
      (await call('PATCH', `/timesheet/e004/${date}`, { code: 'Я', hours: 8 }, hr.token)).status,
    ).toBe(200);
    expect(
      (await call('PATCH', '/timesheet/e004/status', { month, status: 'submitted' }, hr.token)).status,
    ).toBe(200);
    expect(
      (await call('PATCH', `/timesheet/e004/${date}`, { code: 'Я', hours: 8 }, admin.token)).status,
    ).toBe(200);
  });

  it('не утверждает собственный табель, кроме администратора', async () => {
    const hr = await login('hr@hr.local');
    const manager = await login('manager@hr.local');
    const admin = await login('admin@hr.local');
    const month = monthKey();

    expect(
      (await call('PATCH', '/timesheet/e002/status', { month, status: 'approved' }, hr.token)).status,
    ).toBe(403);
    expect(
      (await call('PATCH', '/timesheet/e003/status', { month, status: 'approved' }, manager.token))
        .status,
    ).toBe(403);
    expect(
      (await call('PATCH', '/timesheet/e011/status', { month, status: 'approved' }, admin.token))
        .status,
    ).toBe(200);
  });

  it('HR видит оклады, но не меняет их', async () => {
    const hr = await login('hr@hr.local');
    const admin = await login('admin@hr.local');

    expect((await call('PATCH', '/employees/e004', { salary: 999999 }, hr.token)).status).toBe(400);
    expect((await call('PATCH', '/employees/e004', { salary: 200000 }, admin.token)).status).toBe(400);

    const hrCreated = await call(
      'POST',
      '/employees',
      { status: 'active', salary: 0, departmentId: 'd2', positionId: 'p2', email: 'new.hr.card@company.ru' },
      hr.token,
    );
    expect(hrCreated.status).toBe(201);
    expect(asItem(hrCreated.data).salary).toBe(0);

    const salaryEvent = {
      employeeId: 'e004',
      type: 'salary_change',
      date: todayISO(),
      title: 'Изменение оклада',
      newSalary: 210000,
    };
    expect((await call('POST', '/events', salaryEvent, hr.token)).status).toBe(403);
    expect((await call('POST', '/events', salaryEvent, admin.token)).status).toBe(201);
    expect(
      asItem((await call('GET', '/employees/e004', undefined, admin.token)).data).salary,
    ).toBe(210000);
  });

  it('HR создаёт только свою заявку на отсутствие', async () => {
    const hr = await login('hr@hr.local');
    const admin = await login('admin@hr.local');

    const foreign = await call(
      'POST',
      '/absences',
      { employeeId: 'e008', type: 'vacation', startDate: '2027-06-10', endDate: '2027-06-11' },
      hr.token,
    );
    expect(foreign.status).toBe(403);

    const own = await call(
      'POST',
      '/absences',
      { employeeId: 'e002', type: 'vacation', startDate: '2027-06-10', endDate: '2027-06-11' },
      hr.token,
    );
    expect(own.status).toBe(201);

    const adminForOther = await call(
      'POST',
      '/absences',
      { employeeId: 'e008', type: 'vacation', startDate: '2027-06-12', endDate: '2027-06-13' },
      admin.token,
    );
    expect(adminForOther.status).toBe(201);
  });

  it('не удаляет подразделение и должность, к которым привязаны сотрудники', async () => {
    const hr = await login('hr@hr.local');
    const employee = asItem((await call('GET', '/employees/e002', undefined, hr.token)).data);

    expect(
      (await call('DELETE', `/departments/${employee.departmentId}`, undefined, hr.token)).status,
    ).toBe(400);
    expect(
      (await call('DELETE', `/positions/${employee.positionId}`, undefined, hr.token)).status,
    ).toBe(400);
  });

  it('архивирует сотрудника: закрывает назначения, отклоняет заявки, блокирует вход', async () => {
    const admin = await login('admin@hr.local');
    const beforeAssignments = asArray(
      (await call('GET', '/assignments?employeeId=e004', undefined, admin.token)).data,
    );
    const pending = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: '2027-08-10', endDate: '2027-08-11' },
      admin.token,
    );
    expect(pending.status).toBe(201);
    const pendingId = asItem(pending.data).id as string;

    await prepareDismissal('e004', 'e012', admin.token);
    const dismissed = await call(
      'POST',
      '/events',
      { employeeId: 'e004', type: 'dismissal', date: todayISO(), title: 'Увольнение' },
      admin.token,
    );
    expect(dismissed.status).toBe(201);
    expect(
      asItem((await call('GET', '/employees/e004', undefined, admin.token)).data).status,
    ).toBe('dismissed');

    const history = asItem(
      (await call('GET', `/timesheet?month=${monthKey()}&employeeId=e004`, undefined, admin.token)).data,
    );
    expect(asArray(history.rows).length).toBe(1);
    const bulkTimesheet = asItem((await call('GET', `/timesheet?month=${monthKey()}`, undefined, admin.token)).data);
    expect(
      asArray(bulkTimesheet.rows).some((row) => row.employeeId === 'e004'),
    ).toBe(false);

    const afterAssignments = asArray(
      (await call('GET', '/assignments?employeeId=e004', undefined, admin.token)).data,
    );
    if (beforeAssignments.length > 0) {
      expect(afterAssignments.every((assignment) => Boolean(assignment.endDate))).toBe(true);
    }

    const absences = asArray((await call('GET', '/absences?employeeId=e004', undefined, admin.token)).data);
    expect(asItem(absences.find((absence) => absence.id === pendingId)).status).toBe('rejected');

    const tasks = asArray(
      (await call('GET', '/tasks?employeeId=e004', undefined, admin.token)).data,
    );
    expect(tasks.length).toBeGreaterThan(0);

    expect(
      (await call('POST', '/auth/login', { email: 'employee@hr.local', password: 'demo1234' }))
        .status,
    ).toBe(403);

    expect(
      (
        await call(
          'POST',
          '/events',
          { employeeId: 'e004', type: 'hire', date: todayISO(), title: 'Восстановление' },
          admin.token,
        )
      ).status,
    ).toBe(201);
    expect(
      (await call('POST', '/auth/login', { email: 'employee@hr.local', password: 'demo1234' }))
        .status,
    ).toBe(200);
  });

  it('согласовывает отсутствия только вышестоящая роль', async () => {
    const hr = await login('hr@hr.local');
    const manager = await login('manager@hr.local');
    const admin = await login('admin@hr.local');

    const hrAbsence = await call(
      'POST',
      '/absences',
      { employeeId: 'e002', type: 'vacation', startDate: '2027-08-01', endDate: '2027-08-02' },
      hr.token,
    );
    expect(hrAbsence.status).toBe(201);
    const hrAbsenceId = asItem(hrAbsence.data).id as string;

    expect(
      (await call('PATCH', `/absences/${hrAbsenceId}/status`, { status: 'approved' }, manager.token))
        .status,
    ).toBe(403);
    expect(
      (await call('PATCH', `/absences/${hrAbsenceId}/status`, { status: 'approved' }, hr.token))
        .status,
    ).toBe(403);
    expect(
      (await call('PATCH', `/absences/${hrAbsenceId}/status`, { status: 'approved' }, admin.token))
        .status,
    ).toBe(200);

    const managerAbsence = await call(
      'POST',
      '/absences',
      { employeeId: 'e003', type: 'vacation', startDate: '2027-08-03', endDate: '2027-08-04' },
      manager.token,
    );
    expect(managerAbsence.status).toBe(201);
    const managerAbsenceId = asItem(managerAbsence.data).id as string;
    expect(
      (
        await call(
          'PATCH',
          `/absences/${managerAbsenceId}/status`,
          { status: 'approved' },
          hr.token,
        )
      ).status,
    ).toBe(200);
  });

  it('разрешает self-approve отсутствия только администратору', async () => {
    const admin = await login('admin@hr.local');
    const hr = await login('hr@hr.local');
    const manager = await login('manager@hr.local');

    const adminAbsence = await call(
      'POST',
      '/absences',
      { employeeId: 'e011', type: 'vacation', startDate: '2027-09-01', endDate: '2027-09-02' },
      admin.token,
    );
    expect(adminAbsence.status).toBe(201);
    expect(
      (
        await call(
          'PATCH',
          `/absences/${asItem(adminAbsence.data).id}/status`,
          { status: 'approved' },
          admin.token,
        )
      ).status,
    ).toBe(200);

    for (const [account, employeeId] of [
      [hr, 'e002'],
      [manager, 'e003'],
    ] as const) {
      const created = await call(
        'POST',
        '/absences',
        { employeeId, type: 'vacation', startDate: '2027-09-03', endDate: '2027-09-04' },
        account.token,
      );
      expect(created.status).toBe(201);
      expect(
        (
          await call(
            'PATCH',
            `/absences/${asItem(created.data).id}/status`,
            { status: 'approved' },
            account.token,
          )
        ).status,
      ).toBe(403);
    }
  });

  it('не разрешает редактировать и удалять согласованную заявку напрямую', async () => {
    const admin = await login('admin@hr.local');
    const created = await call(
      'POST',
      '/absences',
      { employeeId: 'e004', type: 'vacation', startDate: '2027-09-10', endDate: '2027-09-11' },
      admin.token,
    );
    expect(created.status).toBe(201);
    const id = asItem(created.data).id as string;
    expect(
      (await call('PATCH', `/absences/${id}/status`, { status: 'approved' }, admin.token)).status,
    ).toBe(200);

    expect((await call('PATCH', `/absences/${id}`, { reason: 'Изменение' }, admin.token)).status).toBe(400);
    expect((await call('DELETE', `/absences/${id}`, undefined, admin.token)).status).toBe(400);

    expect(
      (await call('PATCH', `/absences/${id}/status`, { status: 'pending' }, admin.token)).status,
    ).toBe(200);
    expect((await call('PATCH', `/absences/${id}`, { reason: 'Изменение' }, admin.token)).status).toBe(200);
    expect(
      (await call('PATCH', `/absences/${id}/status`, { status: 'approved' }, admin.token)).status,
    ).toBe(200);
  });
});
