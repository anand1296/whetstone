import { navigate } from '../../state/route.ts';
import { newPlanId, suggestPlanName } from '../../state/plans.ts';
import { updatePrefs } from '../../state/prefs.ts';
import { progressActions } from '../../state/progressStore.ts';
import { PlanForm, type PlanDraft } from './PlanForm.tsx';

/**
 * First run: ask what the person is preparing for, and say plainly what that choice does.
 * Everything after this (dashboard, "up next", review, the sidebar) follows the plan they make here.
 */
export function Onboarding({ hasHistory }: { hasHistory: boolean }) {
  const start = (draft: PlanDraft): void => {
    const id = newPlanId();
    if (!progressActions.savePlan({ id, ...draft })) return;
    updatePrefs({ activePlanId: id });
    navigate({ name: 'plan', planId: id });
  };
  const everything = (): void => start({ name: suggestPlanName([]), facets: [] });

  return (
    <article className="page onboarding">
      <header className="page-header">
        <p className="eyebrow">{hasHistory ? 'No plans yet' : 'Welcome'}</p>
        <h1>What are you preparing for?</h1>
        <p className="lede">
          Pick the topics you care about and we&rsquo;ll make them your first plan. Your progress, &ldquo;up next&rdquo; and spaced review are
          tracked against that plan, not against every question in the bank. You can make more plans later, say one for Frontend + Design
          and another for Go + Kubernetes, and switch between them from your dashboard.
        </p>
      </header>
      <PlanForm submitLabel="Start this plan" onSubmit={start}>
        <button type="button" className="btn btn-quiet" onClick={everything}>
          Not sure yet? Start with everything
        </button>
      </PlanForm>
    </article>
  );
}
