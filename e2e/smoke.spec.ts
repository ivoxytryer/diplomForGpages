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
  await expect(
    page.locator('td').filter({ hasText: 'Изменение оклада' }).first(),
  ).toBeVisible();
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
