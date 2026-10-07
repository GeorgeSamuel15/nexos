import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('first-run setup and returning login open a functional NexOS desktop', async ({}, testInfo) => {
  const userData = testInfo.outputPath('user-data');
  await mkdir(userData, { recursive: true });
  let application = await electron.launch({
    args: [resolve('apps/desktop')],
    cwd: resolve('.'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NEXOS_USER_DATA_DIR: userData,
    },
  });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole('heading', { name: 'Make NexOS yours.' })).toBeVisible();
    await page.getByLabel('Display name').fill('NexOS Test User');
    await page.getByLabel('Username').fill('nexostest');
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
    await page.getByLabel('Confirm password').fill('correct-horse-battery');
    await page.getByRole('button', { name: /Enter NexOS/i }).click();

    await expect(page.getByRole('navigation', { name: 'NexOS taskbar' })).toBeVisible();
    await page.getByRole('button', { name: 'Files' }).first().dblclick();
    await expect(page.getByRole('dialog', { name: 'Files application window' })).toBeVisible();
    await page.getByRole('option', { name: 'Documents' }).dblclick();
    await expect(page.getByText('Welcome to NexOS.md')).toBeVisible();

    await application.close();
    application = await electron.launch({
      args: [resolve('apps/desktop')],
      cwd: resolve('.'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        NEXOS_USER_DATA_DIR: userData,
      },
    });

    const loginPage = await application.firstWindow();
    await expect(loginPage.getByRole('heading', { name: 'NexOS Test User' })).toBeVisible();
    await expect(loginPage.getByText('@nexostest')).toBeVisible();
    await loginPage.getByPlaceholder('Password').fill('correct-horse-battery');
    await loginPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(loginPage.getByRole('navigation', { name: 'NexOS taskbar' })).toBeVisible();
  } finally {
    await application.close().catch(() => undefined);
  }
});
