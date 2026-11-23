import { expect, test } from '@playwright/test';
import { EVERYTHING_URL, seedEverythingPlan } from './helpers.ts';

test('mobile: drawer navigation, no horizontal scroll', async ({ page }) => {
  await seedEverythingPlan(page);
  await page.goto(EVERYTHING_URL);
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(await noOverflow()).toBe(true);

  // The overview lists the topics itself, so the drawer only repeats them once you are inside one.
  await page.locator('.round-list .round', { has: page.locator('.round-title', { hasText: /^Accessibility/ }) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accessibility');

  await page.getByRole('button', { name: 'Open topics menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: /^Machine Coding/ }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Machine Coding');

  await page.locator('.q').first().locator('.q-trigger').click();
  await page.locator('.q').first().getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.locator('.q').first().locator('.callout-tldr')).toBeVisible();
  expect(await noOverflow()).toBe(true); // wide code blocks scroll inside their own container
});
