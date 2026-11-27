import { expect, test, type Page } from '@playwright/test';
import { statSync } from 'node:fs';

const PASSWORD = 'demo1234';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  await page.waitForLoadState('networkidle');
}

async function logout(page: Page) {
  await page.evaluate(() => localStorage.removeItem('hr-auth'));
  await page.goto('/login');
}

test('вход: тёмная тема, подписи и ошибка пароля', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('html')).toHaveClass(/dark/);

  // Подпись должна быть связана с полем.
  await page.getByText('Email', { exact: true }).click();
  await expect(page.locator('input[type=email]')).toBeFocused();

  await page.getByLabel('Email', { exact: true }).fill('admin@hr.local');
  await page.getByLabel('Пароль', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();

  await expect(page.getByText('Неверный email или пароль')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // Быстрый вход сотрудника.
  await page.getByRole('button', { name: /Войти как Сотрудник/ }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText('Попова', { exact: false }).first()).toBeVisible();
});

test('роли: разрешённые и запрещённые разделы', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();

  await logout(page);
  await login(page, 'manager@hr.local');
  await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();

  await page.goto('/admin/users');
  await expect(page.getByText('Недостаточно прав')).toBeVisible();
  await expect(page).toHaveURL(/\/forbidden$/);

  await logout(page);
  await login(page, 'employee@hr.local');
  await expect(page).toHaveURL(/\/me$/);

  await page.goto('/employees');
  await expect(page).toHaveURL(/\/me$/);

  await page.goto('/reports');
  await expect(page).toHaveURL(/\/me$/);
});

test('manager: видит команды проектов из других подразделений', async ({ page }) => {
  await login(page, 'manager@hr.local');
  await page.goto('/employees');

  await expect(
    page.getByText('Показаны сотрудники вашей области', { exact: false }),
  ).toBeVisible();

  // e012 работает в другом подразделении, но входит в проект pr1.
  await page.getByPlaceholder('ФИО, email').fill('12@company.ru');
  await expect(page.getByText('12@company.ru', { exact: false }).first()).toBeVisible();
});

test('manager: перегруз не подрезает проценты при редактировании', async ({ page }) => {
  const employee = 'Лебедева Полина Андреевна';

  // Администратор создаёт назначение, из-за которого загрузка становится 110%.
  await login(page, 'admin@hr.local');
  await page.goto('/workload');
  const adminRow = page.getByRole('row', { name: new RegExp(employee) }).first();
  await adminRow.getByTitle(/ERP-системы · не назначен/).click();
  const adminDialog = page.getByRole('dialog');
  await adminDialog.getByLabel('Загрузка, %').fill('50');
  await adminDialog.getByLabel('Причина перегруза *').fill('Проверка перегруза');
  await adminDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(adminDialog).toBeHidden();

  // Руководитель открывает это назначение: форма показывает фактические 50%,
  // а не свободные 40%, и предупреждает о превышении лимита.
  await logout(page);
  await login(page, 'manager@hr.local');
  await page.goto('/workload');
  const managerRow = page.getByRole('row', { name: new RegExp(employee) }).first();
  await managerRow.getByTitle(/ERP-системы · .* · 50%/).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByLabel('Загрузка, %')).toHaveValue('50');
  await expect(dialog.getByText(/лимит 100%/)).toBeVisible();
  await expect(dialog.getByText(/Уменьшите до 40% или меньше/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

  await dialog.getByLabel('Загрузка, %').fill('40');
  await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
});

test('admin: массовое утверждение табелей', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/timesheet');

  const bulk = page.getByRole('button', { name: /Утвердить все/ });
  await expect(bulk).toBeVisible();
  await bulk.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Будут утверждены табели сотрудников')).toBeVisible();
  await dialog.getByRole('button', { name: /Утвердить \(/ }).click();

  await expect(page.getByText(/Утверждено табелей:/)).toBeVisible();
});

test('admin: массовое согласование отсутствий', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/absences?scope=all');

  const bulk = page.getByRole('button', { name: /Согласовать все/ });
  await expect(bulk).toBeVisible();
  await bulk.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Будет согласовано заявок')).toBeVisible();
  await dialog.getByRole('button', { name: /Согласовать \(/ }).click();

  await expect(page.getByText(/Согласовано заявок:/)).toBeVisible();
});

test('admin: массовое добавление участников проекта', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/projects/pr1');

  await page.getByRole('button', { name: 'Нескольких' }).first().click();
  const dialog = page.getByRole('dialog');
  const boxes = dialog.locator('input[type=checkbox]:not([disabled])');
  await expect(boxes.first()).toBeVisible();

  await boxes.nth(0).check();
  await boxes.nth(1).check();
  const submit = dialog.getByRole('button', { name: /Добавить \(2\)/ });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText('Добавлено участников: 2')).toBeVisible();
});

test('admin: форма учитывает будущий пик загрузки', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/workload');

  const employee = 'Новиков Никита Михайлович';
  const row = page.getByRole('row', { name: new RegExp(employee) }).first();

  // Будущее назначение: сегодня загрузка 100%, с 15.12 станет 140%.
  await row.getByTitle(/Миграция в облако · не назначен/).click();
  const futureDialog = page.getByRole('dialog');
  await futureDialog.getByLabel('Загрузка, %').fill('40');
  await futureDialog.getByLabel('Дата начала').fill('2026-12-15');
  await futureDialog.getByLabel('Причина перегруза *').fill('Проверка будущего пика');
  await futureDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(futureDialog).toBeHidden();

  // Новое назначение на сегодня даст 140% сразу и 180% после 15.12.
  await row.getByTitle(/CRM-релиз 2.0 · не назначен/).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Загрузка, %').fill('40');

  await expect(dialog.getByText(/Пик 140% · после назначения 180%/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
});

test('hr: уведомление → согласование → событие', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);

  // Сотрудник создаёт заявку — у HR должно появиться уведомление.
  await login(page, 'employee@hr.local');
  await page.goto('/absences');
  await page.getByRole('button', { name: /Новая заявка/ }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Тип отсутствия').selectOption('unpaid');
  await form.getByLabel('Дата начала *').fill(today);
  await form.getByLabel('Дата окончания *').fill(today);
  await form.getByLabel('Комментарий').fill('Проверка уведомлений HR');
  await form.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Заявка создана', { exact: true })).toBeVisible();

  await logout(page);
  await login(page, 'hr@hr.local');

  await page.getByRole('button', { name: /Уведомления, непрочитанных/ }).click();
  await expect(page.getByText('Новая заявка на согласование').first()).toBeVisible();
  await expect(page.getByText(/Попова Анна/).first()).toBeVisible();
  await page.mouse.click(20, 200);

  await page.goto('/absences?status=pending&scope=all');
  const row = page.locator('tr', { hasText: 'Проверка уведомлений HR' }).first();
  await row.getByTitle('Согласовать').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Согласовать', exact: true }).click();
  await expect(page.getByText('Отсутствие согласовано', { exact: true })).toBeVisible();

  await page.goto('/events');
  await expect(page.getByText(/Попова Анна/).first()).toBeVisible();
});

test('admin: орг-структура', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/directory/structure');

  await expect(page.getByRole('heading', { name: 'Орг-структура' })).toBeVisible();
  await expect(page.getByText('IT-департамент', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: /IT-департамент/ }).first().click();
  await expect(page.getByText('Руководитель', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Сотрудники', { exact: true }).first()).toBeVisible();

  await page
    .getByPlaceholder('Отдел, код, руководитель или сотрудник…')
    .fill('Отдел разработки');
  await expect(page.getByText('Отдел разработки', { exact: false }).first()).toBeVisible();
});

test('admin: история должностей и окладов', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/employees/e004');

  await page.getByRole('button', { name: /История/ }).click();
  await expect(page.getByText('История должностей и окладов')).toBeVisible();
  await expect(page.getByText('Динамика оклада')).toBeVisible();
  await expect(page.getByText('Грейд', { exact: true })).toBeVisible();
  await expect(
    page.locator('td').filter({ hasText: 'Изменение оклада' }).first(),
  ).toBeVisible();
});

test('admin: изменение оклада сразу появляется в истории', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/employees/e004');
  await page.getByRole('button', { name: /История/ }).click();

  await page.getByRole('button', { name: /Событие/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Тип события').selectOption('salary_change');
  await dialog.getByLabel('Дата *').fill('2026-11-26');
  await dialog.getByLabel('Заголовок *').fill('Смоук: изменение оклада');
  await dialog.getByLabel('Новый оклад, ₽').fill('185000');
  await dialog.getByLabel('Комментарий').fill('Проверка обновления истории');
  await dialog.getByRole('button', { name: 'Создать событие' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Смоук: изменение оклада', { exact: true })).toBeVisible();
  await expect(page.getByText('185 000 ₽').first()).toBeVisible();

  // Событие должно сразу попасть в дашборд и ленту событий.
  await page.goto('/');
  await expect(page.getByText('Смоук: изменение оклада', { exact: true })).toBeVisible();

  await page.goto('/events');
  await expect(page.getByText('Смоук: изменение оклада', { exact: true })).toBeVisible();
});

test('hr: матрица загрузки без редактирования команды', async ({ page }) => {
  await login(page, 'hr@hr.local');
  await page.goto('/workload');
  await expect(page.getByRole('heading', { name: 'Матрица загрузки' })).toBeVisible();

  const cell = page.locator('button[title*="не назначен"]').first();
  await expect(cell).toBeVisible();
  await expect(cell).toBeDisabled();
});

test('admin: создание сотрудника', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/employees');
  await page.getByRole('button', { name: /Добавить сотрудника/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Фамилия *').fill('Смоук');
  await page.getByLabel('Имя *').fill('Тест');
  await page.getByLabel('Отчество').fill('Проверочный');
  await page.getByLabel('Дата рождения *').fill('1992-04-12');
  await page.getByLabel('Email *').fill('smoke.employee@hr.local');
  await page.getByLabel('Телефон *').fill('+7 900 123-45-67');
  await page.getByLabel('Подразделение *').selectOption('d5');
  await page.getByLabel('Должность *').selectOption('p5');
  await page.getByLabel('Оклад, ₽ *').fill('150000');
  await page.getByLabel('Дата приёма *').fill('2026-11-01');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();

  await expect(page.getByText('Сотрудник добавлен', { exact: true })).toBeVisible();
  await page.getByPlaceholder('ФИО, email, табельный номер…').fill('Смоук');
  await expect(page.getByText('Смоук Тест', { exact: false }).first()).toBeVisible();
});

test('admin: правка клетки табеля', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/timesheet');

  const cell = page.locator('button[title*="Явка"]:not([disabled])').first();
  await expect(cell).toBeVisible();
  await cell.click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Код').selectOption('Я');
  await page.getByLabel('Часы').fill('8');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

  await expect(page.getByText('Отметка сохранена', { exact: true })).toBeVisible();
  await expect(page.locator('button[title*="изменено вручную"]').first()).toBeVisible();
});

test('admin: создание и согласование отсутствия', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/absences');
  const today = new Date().toISOString().slice(0, 10);

  await page.getByRole('button', { name: /Новая заявка/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Сотрудник *').selectOption('e004');
  await page.getByLabel('Тип отсутствия').selectOption('vacation');
  await page.getByLabel('Дата начала *').fill(today);
  await page.getByLabel('Дата окончания *').fill(today);
  await page.getByLabel('Комментарий').fill('Смоук-отпуск');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();

  await expect(page.getByText('Заявка создана', { exact: true })).toBeVisible();

  const row = page.locator('tr', { hasText: 'Смоук-отпуск' }).first();
  await expect(row).toBeVisible();
  await row.getByTitle('Согласовать').click();

  const approval = page.getByRole('dialog');
  await expect(approval).toBeVisible();
  await approval.getByRole('button', { name: 'Согласовать', exact: true }).click();

  await expect(page.getByText('Отсутствие согласовано', { exact: true })).toBeVisible();
  await expect(row.getByText('Согласовано', { exact: true })).toBeVisible();
});

test('admin: выгрузка Excel', async ({ page }, testInfo) => {
  await login(page, 'admin@hr.local');
  await page.goto('/reports');

  const excel = page.getByRole('button', { name: /Excel/ });
  await expect(excel).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await excel.click();
  const download = await downloadPromise;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);

  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(statSync(file).size).toBeGreaterThan(1000);
});

test('диалоги: focus trap и Escape', async ({ page }) => {
  await login(page, 'admin@hr.local');
  await page.goto('/employees');

  const trigger = page.getByRole('button', { name: /Добавить сотрудника/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const element = document.querySelector('[role="dialog"]');
      return Boolean(element && element.contains(document.activeElement));
    });
    expect(inside, `фокус вышел из диалога на шаге ${index + 1}`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('мобильная ширина: нет горизонтального переполнения', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'admin@hr.local');
  await page.goto('/employees');
  await expect(page.getByRole('heading', { name: 'Сотрудники' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
