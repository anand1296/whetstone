import { expect, test, type Page } from '@playwright/test';
import { PROGRESS_KEY } from './helpers.ts';

/**
 * Plans: a named set of topics. These tests start from a browser that has never been here
 * (no seeded plan), because the first run is the point.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });
  return errors;
}

const roles = (page: Page) => page.getByRole('group', { name: 'Role' });
const focus = (page: Page) => page.getByRole('group', { name: 'Focus areas' });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const card = (page: Page, name: string) => page.locator('.plan-card', { has: page.locator('.plan-card-name', { hasText: new RegExp(`^${escape(name)}$`) }) });
const size = (page: Page) => page.locator('.plan-size');

test('a first visit asks what you are preparing for, and says what the choice does', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What are you preparing for?');
  await expect(page.locator('.lede')).toContainText('tracked against that plan');
  await expect(page.locator('.nav-rounds')).toHaveCount(0);
  await expect(focus(page)).toHaveCount(0); // chips appear once a role is chosen
  await expect(size(page)).toContainText('26 topics');

  // Roles with no content yet are visible but disabled, with a tooltip.
  const qe = roles(page).getByRole('button', { name: /^QE/ });
  await expect(qe).toHaveAttribute('aria-disabled', 'true');
  await qe.hover();
  await expect(page.locator('.chip-wrap', { hasText: 'QE' }).getByRole('tooltip')).toHaveCSS('opacity', '1');
  await qe.click({ force: true }); // aria-disabled: Playwright would otherwise wait for it to be enabled
  await expect(size(page)).toContainText('26 topics');

  // Backend: low-level design, Java, Node.js, Go and Kubernetes, with Python announced.
  await roles(page).getByRole('button', { name: /^Backend/ }).click();
  await expect(size(page)).toContainText('6 topics');
  await expect(focus(page).getByRole('button', { name: 'Python' })).toHaveAttribute('aria-disabled', 'true');
  await focus(page).getByRole('button', { name: /^Go/ }).click();
  await expect(size(page)).toContainText('1 topic ·');
  await focus(page).getByRole('button', { name: /^Kubernetes/ }).click(); // chips widen
  await expect(size(page)).toContainText('2 topics');

  // The name follows the choice until you type your own.
  await expect(page.getByLabel('Plan name')).toHaveValue('Backend · Go, Kubernetes');
  await roles(page).getByRole('button', { name: /^Design/ }).click();
  await expect(page.getByLabel('Plan name')).toHaveValue('Backend + Design · Go, Kubernetes');
  await roles(page).getByRole('button', { name: /^Design/ }).click();
  await page.getByLabel('Plan name').fill('Go and Kubernetes');
  await page.getByRole('button', { name: 'Start this plan' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Go and Kubernetes');
  await expect(page.locator('.round-list .round')).toHaveCount(2);
  await expect(page.locator('.loop-ring')).toContainText('0/12');
  await expect(page.locator('.nav-rounds')).toHaveCount(0); // the page lists the topics itself

  // The plan is remembered: no onboarding the second time.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plans');
  await expect(card(page, 'Go and Kubernetes')).toContainText('0/12 done');
  await page.reload();
  await expect(card(page, 'Go and Kubernetes')).toBeVisible();
  expect(errors).toEqual([]);
});

test('"start with everything" is one click for people who are not sure yet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start with everything/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everything');
  await expect(page.locator('.round-list .round')).toHaveCount(26);
});

test('several plans, each tracking only its own topics; a finished question counts in every plan that has it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await roles(page).getByRole('button', { name: /^Frontend/ }).click();
  await roles(page).getByRole('button', { name: /^Design/ }).click();
  await page.getByRole('button', { name: 'Start this plan' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frontend + Design');

  // A second plan from the dashboard.
  await page.getByRole('button', { name: 'All plans' }).click();
  await page.getByRole('button', { name: /New plan/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New plan' });
  await dialog.getByRole('group', { name: 'Role' }).getByRole('button', { name: /^Backend/ }).click();
  await dialog.getByRole('group', { name: 'Focus areas' }).getByRole('button', { name: /^Go/ }).click();
  await dialog.getByRole('group', { name: 'Focus areas' }).getByRole('button', { name: /^Kubernetes/ }).click();
  await dialog.getByLabel('Plan name').fill('Go + Kubernetes');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Go + Kubernetes');

  // A third, wider one that overlaps it.
  await page.getByRole('button', { name: 'All plans' }).click();
  await page.getByRole('button', { name: /New plan/ }).click();
  await dialog.getByRole('group', { name: 'Role' }).getByRole('button', { name: /^Backend/ }).click();
  await dialog.getByLabel('Plan name').fill('Backend');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('button', { name: 'All plans' }).click();

  await expect(page.locator('.plan-card:not(.plan-card-new)')).toHaveCount(3);
  await expect(card(page, 'Frontend + Design')).toContainText('0/247 done');
  await expect(card(page, 'Go + Kubernetes')).toContainText('0/12 done');
  await expect(card(page, 'Backend')).toContainText('0/48 done');

  // Work in the Go plan: the sidebar follows it, and says what it leaves out.
  await card(page, 'Go + Kubernetes').getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Go Backend' })).toBeVisible();
  const sidebarTopics = page.locator('.nav-rounds .nav-round');
  await expect(sidebarTopics).toHaveCount(2);
  await expect(page.getByRole('button', { name: /24 topics are outside this plan/ })).toBeVisible();
  await page.locator('.q').first().getByRole('checkbox').check();

  // One finished question moves the Go plan and the Backend plan, and leaves Frontend + Design alone.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My plans' }).click();
  await expect(card(page, 'Go + Kubernetes')).toContainText('1/12 done');
  await expect(card(page, 'Backend')).toContainText('1/48 done');
  await expect(card(page, 'Frontend + Design')).toContainText('0/247 done');

  // The plan page is scoped too.
  await card(page, 'Go + Kubernetes').getByRole('button', { name: /Go \+ Kubernetes progress|^Go \+ Kubernetes/ }).first().click();
  await expect(page.locator('.loop-ring')).toContainText('1/12');
  await expect(page.locator('.round-list .round')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('edit a plan, delete it, and start again when none are left', async ({ page }) => {
  await page.goto('/');
  await roles(page).getByRole('button', { name: /^Design/ }).click();
  await page.getByRole('button', { name: 'Start this plan' }).click();
  await expect(page.locator('.round-list .round')).toHaveCount(1);
  await page.locator('.q').count(); // (the topic list is on this page; open it to finish a question)
  await page.locator('.round-list .round').first().click();
  await page.locator('.q').first().getByRole('checkbox').check();

  // Widen the plan from its own page.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My plans' }).click();
  await card(page, 'Design').getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit plan' });
  await dialog.getByRole('group', { name: 'Role' }).getByRole('button', { name: /^Backend/ }).click();
  await dialog.getByLabel('Plan name').fill('Design and backend');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'My plans' }).click();
  await expect(card(page, 'Design and backend')).toContainText('1/');
  await expect(card(page, 'Design and backend')).toContainText('7 topics');

  // Deleting asks first, and keeps the progress on the questions.
  await card(page, 'Design and backend').getByRole('button', { name: 'Edit' }).click();
  await dialog.getByRole('button', { name: 'Delete plan' }).click();
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(card(page, 'Design and backend')).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete plan' }).click();
  await dialog.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What are you preparing for?');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROGRESS_KEY);
  expect(Object.values(saved.questions).filter((q) => (q as { done: boolean }).done)).toHaveLength(1);

  // A new plan over the same topics picks the finished question up again.
  await page.getByRole('button', { name: /Start with everything/ }).click();
  await expect(page.locator('.loop-ring')).toContainText('1/304');
  await page.reload();
  await expect(page.locator('.loop-ring')).toContainText('1/304');
});

test('people who used the app before plans keep their topic filter as their first plan', async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      if (window.localStorage.getItem('seeded')) return;
      window.localStorage.setItem('seeded', '1');
      window.localStorage.setItem('whetstone:prefs:v1', JSON.stringify({ theme: 'system', practiceMode: false, framework: 'react', status: 'all', level: 'all', facets: ['design'] }));
      window.localStorage.setItem(key, JSON.stringify({ version: 1, questions: { 'xss-react': { done: true, doneAt: 1, stage: 0, dueAt: 9e15, notes: '', updatedAt: 2 } }, lastVisit: null }));
    },
    { key: PROGRESS_KEY },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your plans');
  await expect(page.locator('.plan-card:not(.plan-card-new)')).toHaveCount(1);
  await expect(card(page, 'Design')).toContainText('1 topic');
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('whetstone:prefs:v1') ?? '{}'));
  expect(prefs.facets).toEqual([]);

  // Same again after a reload: still one plan, not a second one.
  await page.reload();
  await expect(page.locator('.plan-card:not(.plan-card-new)')).toHaveCount(1);
});

test('people with progress but no filter get an Everything plan, not a question', async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, JSON.stringify({ version: 1, questions: { 'xss-react': { done: true, doneAt: 1, stage: 0, dueAt: 1000, notes: '', updatedAt: 2 } }, lastVisit: null }));
    },
    { key: PROGRESS_KEY },
  );
  await page.goto('/');
  await expect(card(page, 'Everything')).toContainText('1/304 done');
});

test('review follows the plan you are working in, with the rest one click away', async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      if (window.localStorage.getItem(key)) return;
      const plan = { name: 'Go and Kubernetes', facets: ['backend', 'go', 'kubernetes'], createdAt: 1, updatedAt: 1, deleted: false };
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 1, questions: { 'xss-react': { done: true, doneAt: 1, stage: 0, dueAt: 1000, notes: '', updatedAt: 2 } }, lastVisit: null, plans: { 'plan-go': plan } }),
      );
    },
    { key: PROGRESS_KEY },
  );
  await page.goto('/#plan/plan-go');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Go and Kubernetes');
  await expect(page.locator('.action-card', { hasText: 'Review' })).toContainText('Nothing due right now');
  await expect(page.locator('.nav-item', { hasText: 'Review' }).locator('.badge')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Review/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are up to date');
  await expect(page.locator('.review-scope')).toContainText('1 more answer due in topics outside this plan');
  await page.getByRole('button', { name: 'Review them too' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 answer to refresh');
});
