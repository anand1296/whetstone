import type { Page } from '@playwright/test';

export const PROGRESS_KEY = 'whetstone:progress:v1';
/** The plan the helpers create: no facets, so it holds every topic, like the pre-plans overview did. */
export const EVERYTHING = 'plan-all';
export const EVERYTHING_URL = `/#plan/${EVERYTHING}`;

/**
 * Starts a browser that has already been through onboarding: one "Everything" plan, written
 * the same way the app writes it. Only when this browser has no progress yet, so reloads and
 * tests that seed their own progress are left alone (the app turns that into a first plan itself).
 */
export async function seedEverythingPlan(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, id }) => {
      try {
        if (window.localStorage.getItem(key)) return;
        const plan = { name: 'Everything', facets: [], createdAt: 1, updatedAt: 1, deleted: false };
        window.localStorage.setItem(key, JSON.stringify({ version: 1, questions: {}, lastVisit: null, plans: { [id]: plan } }));
      } catch {
        // Storage blocked: the app falls back to onboarding.
      }
    },
    { key: PROGRESS_KEY, id: EVERYTHING },
  );
}
