import { useMemo, useState } from 'react';
import { preloadSection, useContent } from '../../content/index.ts';
import { describeSelection } from '../../content/facets.ts';
import { Icon } from '../../components/Icon.tsx';
import { InlineText, ProgressBar } from '../../components/primitives.tsx';
import { formatStudyTime, plural } from '../../lib/format.ts';
import { effectiveFacets, planStats } from '../../state/plans.ts';
import { updatePrefs } from '../../state/prefs.ts';
import { MAX_LIVE_PLANS, type Plan } from '../../state/progress.ts';
import { progressStore } from '../../state/progressStore.ts';
import { continueTarget } from '../../state/selectors.ts';
import { navigate } from '../../state/route.ts';
import { useStore } from '../../state/useStore.ts';
import { useServer } from '../../platform/backend.ts';
import { SuggestTopicDialog } from '../contribute/SuggestTopic.tsx';
import { Onboarding } from '../plans/Onboarding.tsx';
import { openPlanEditor } from '../plans/PlanEditor.tsx';
import { useLegacyPlanSeed, usePlans, useSyncSettled } from '../plans/usePlans.ts';

/**
 * The home page is a dashboard of plans. A plan is a named set of topics (Frontend + Design,
 * Go + Kubernetes); each card shows progress against that plan only, so someone preparing for
 * one role is never measured against questions they will not be asked.
 *
 * With no plans yet it is the first-run question: what are you preparing for?
 */
export function Overview() {
  const plans = usePlans();
  const settled = useSyncSettled();
  const seed = useLegacyPlanSeed();
  const hasEntries = useStore(progressStore, (s) => Object.keys(s.plans).length > 0);

  if (plans.length > 0) return <Dashboard plans={plans} />;
  // Plans may still be on their way from the server, or an earlier filter is about to become the first plan.
  if (!settled || seed !== null) {
    return (
      <article className="page overview" aria-busy="true">
        <p className="admin-note" role="status">
          Loading your plans…
        </p>
      </article>
    );
  }
  return <Onboarding hasHistory={hasEntries} />;
}

function Dashboard({ plans }: { plans: Plan[] }) {
  const { sections } = useContent();
  const { site } = useServer();
  const [suggesting, setSuggesting] = useState(false);

  return (
    <article className="page overview dashboard">
      <header className="overview-hero">
        <div className="overview-intro">
          <p className="eyebrow">{site.tagline || 'Junior to principal engineering interviews'}</p>
          <h1>Your plans</h1>
          <p className="lede">
            Each plan tracks your progress against the topics you picked for it, and nothing else. Make one per goal, like Frontend + Design
            for one interview loop and Go + Kubernetes for another. A question you finish counts in every plan that includes it.
          </p>
        </div>
      </header>

      <ul className="plan-grid" aria-label="Plans">
        {plans.map((plan) => (
          <li key={plan.id}>
            <PlanCard plan={plan} sections={sections} />
          </li>
        ))}
        {plans.length < MAX_LIVE_PLANS ? (
          <li>
            <button type="button" className="plan-card plan-card-new" onClick={() => openPlanEditor(null)}>
              <Icon name="sparkle" size={20} />
              <span className="plan-card-name">New plan</span>
              <span className="plan-card-sub">Pick the roles and focus areas for another goal.</span>
            </button>
          </li>
        ) : null}
      </ul>

      <p className="dashboard-foot">
        Missing something you would be asked about?{' '}
        <button type="button" className="link-btn" onClick={() => setSuggesting(true)}>
          Suggest a topic
        </button>
      </p>
      <SuggestTopicDialog open={suggesting} onClose={() => setSuggesting(false)} />
    </article>
  );
}

function PlanCard({ plan, sections }: { plan: Plan; sections: ReturnType<typeof useContent>['sections'] }) {
  const { questionsById, sectionsById } = useContent();
  const state = useStore(progressStore, (s) => s);
  const [now] = useState(() => Date.now());
  const facets = useMemo(() => effectiveFacets(sections, plan.facets), [sections, plan.facets]);
  const stats = useMemo(() => planStats(sections, { facets }, state.questions, now), [sections, facets, state.questions, now]);
  const target = useMemo(() => continueTarget(stats.sections, state), [stats.sections, state]);
  const targetQuestion = target ? questionsById.get(target.questionId) : undefined;
  const targetSection = target ? sectionsById.get(target.sectionId) : undefined;
  const total = stats.questions.length;
  const complete = total > 0 && stats.done === total;

  return (
    <section className="plan-card" aria-labelledby={`${plan.id}-name`} data-complete={complete}>
      <button type="button" className="plan-card-open" onClick={() => navigate({ name: 'plan', planId: plan.id })}>
        <span id={`${plan.id}-name`} className="plan-card-name">
          {plan.name}
        </span>
        <span className="plan-card-sub">
          {plural(stats.sections.length, 'topic')} · {plural(total, 'question')}
          {facets.length > 0 && describeSelection(facets) !== plan.name ? ` · ${describeSelection(facets)}` : ''}
        </span>
        <span className="plan-card-progress">
          <span className="tabular">
            {stats.done}/{total} done
          </span>
          <span>{complete ? 'Complete' : `about ${formatStudyTime(stats.minutesLeft)} left`}</span>
        </span>
        <ProgressBar value={stats.done} max={total} label={`${plan.name} progress`} />
      </button>

      {stats.due > 0 ? (
        <p className="plan-card-due">
          <span className="badge" aria-label={`${stats.due} due`}>
            {stats.due}
          </span>{' '}
          due for a refresher
        </p>
      ) : null}

      <div className="plan-card-foot">
        {target && targetQuestion && targetSection ? (
          <button
            type="button"
            className="btn btn-primary btn-small"
            onPointerEnter={() => preloadSection(target.sectionId)}
            onClick={() => {
              updatePrefs({ activePlanId: plan.id }); // the sidebar and review follow the plan you start from
              navigate({ name: 'section', sectionId: target.sectionId, questionId: target.questionId });
            }}
            aria-label={`${target.resumed || stats.done > 0 ? 'Continue' : 'Start'} ${plan.name}: ${targetQuestion.title}`}
          >
            {target.resumed || stats.done > 0 ? 'Continue' : 'Start'} <Icon name="arrowRight" size={16} />
          </button>
        ) : (
          <span className="plan-card-done">{total === 0 ? 'No topics yet' : 'Every question done'}</span>
        )}
        {targetQuestion ? (
          <span className="plan-card-next">
            Next: <InlineText text={targetQuestion.title} />
          </span>
        ) : null}
        <button type="button" className="btn btn-quiet btn-small plan-card-edit" onClick={() => openPlanEditor(plan.id)}>
          Edit
        </button>
      </div>
    </section>
  );
}
