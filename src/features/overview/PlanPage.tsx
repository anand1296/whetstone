import { useEffect, useMemo, useState } from 'react';
import { preloadSection, useContent } from '../../content/index.ts';
import { describeSelection, facetLabel, groupOf } from '../../content/facets.ts';
import { LEVELS, LEVEL_LABEL } from '../../content/types.ts';
import { isGrowing } from '../../content/coverage.ts';
import { Icon } from '../../components/Icon.tsx';
import { LoopRing } from '../../components/LoopRing.tsx';
import { InlineText, ProgressBar } from '../../components/primitives.tsx';
import { formatStudyTime, plural } from '../../lib/format.ts';
import { effectiveFacets, planStats } from '../../state/plans.ts';
import { prefsStore, updatePrefs } from '../../state/prefs.ts';
import { progressStore } from '../../state/progressStore.ts';
import { continueTarget, doneCount } from '../../state/selectors.ts';
import { navigate } from '../../state/route.ts';
import { useStore } from '../../state/useStore.ts';
import { useServer } from '../../platform/backend.ts';
import { SuggestTopicDialog } from '../contribute/SuggestTopic.tsx';
import { openPlanEditor } from '../plans/PlanEditor.tsx';

/** One plan: how far along you are, what is next, what is due, and its topics. Everything here is scoped to the plan. */
export function PlanPage({ planId }: { planId: string }) {
  const { questionsById, sections, sectionsById } = useContent();
  const state = useStore(progressStore, (s) => s);
  const { features } = useServer();
  const [now] = useState(() => Date.now());
  const activePlanId = useStore(prefsStore, (p) => p.activePlanId);
  const [suggesting, setSuggesting] = useState(false);
  const plan = state.plans[planId];
  const live = plan !== undefined && !plan.deleted;

  // Opening a plan makes it the one this device works in (sidebar, review).
  useEffect(() => {
    if (live && activePlanId !== planId) updatePrefs({ activePlanId: planId });
  }, [live, activePlanId, planId]);

  const facets = useMemo(() => (plan ? effectiveFacets(sections, plan.facets) : []), [plan, sections]);
  const stats = useMemo(() => planStats(sections, { facets }, state.questions, now), [sections, facets, state.questions, now]);
  const mine = stats.sections;
  const segments = useMemo(
    () => mine.map((section) => ({ section, done: doneCount(section.questions, state.questions) })),
    [mine, state.questions],
  );
  const numbers = useMemo(() => new Map(sections.map((section, index) => [section.id, index + 1])), [sections]);
  const questions = stats.questions;
  const done = stats.done;
  const total = questions.length;
  const target = useMemo(() => continueTarget(mine, state), [mine, state]);
  const targetQuestion = target ? questionsById.get(target.questionId) : undefined;
  const targetSection = target ? sectionsById.get(target.sectionId) : undefined;

  if (!plan || plan.deleted) {
    return (
      <article className="page plan-page">
        <header className="page-header">
          <h1>That plan is gone</h1>
          <p className="lede">It may have been deleted on another device.</p>
        </header>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => navigate({ name: 'overview' })}>
            Back to your plans
          </button>
        </div>
      </article>
    );
  }

  const byLevel = LEVELS.map((level) => {
    const ofLevel = questions.filter((q) => q.level === level);
    return { level, total: ofLevel.length, done: doneCount(ofLevel, state.questions) };
  });

  return (
    <article className="page overview plan-page">
      <header className="overview-hero">
        <div className="overview-intro">
          <button type="button" className="back-link" onClick={() => navigate({ name: 'overview' })}>
            <Icon name="arrowLeft" size={16} /> All plans
          </button>
          <h1>{plan.name}</h1>
          <p className="lede">
            {plural(total, 'question')} across {plural(mine.length, 'topic')}
            {facets.length > 0 ? ` for ${describeSelection(facets)}` : ''}, about {formatStudyTime(stats.minutes)} of study. Your progress
            here counts only these topics. Each question has a written answer: the mental model, working code and the follow-ups an
            interviewer reaches for. Resist opening it. Say your own answer out loud first, then compare, and tick the question off
            only when you could say it in the room.
          </p>
          <div className="button-row">
            <button type="button" className="btn btn-small" onClick={() => openPlanEditor(plan.id)}>
              Edit plan
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setSuggesting(true)}>
              <Icon name="megaphone" size={16} /> Suggest a topic
            </button>
          </div>
        </div>
      </header>

      <section className="overview-grid" aria-label={`Your progress: ${plan.name}`}>
        <LoopRing
          segments={segments}
          done={done}
          total={total}
          onSelect={(sectionId) => navigate({ name: 'section', sectionId })}
        />

        <div className="overview-actions">
          {target && targetQuestion && targetSection ? (
            <button
              type="button"
              className="action-card is-primary"
              onPointerEnter={() => preloadSection(target.sectionId)}
              onClick={() => navigate({ name: 'section', sectionId: target.sectionId, questionId: target.questionId })}
            >
              <span className="action-label">{target.resumed ? 'Pick up where you left off' : done === 0 ? 'Start here' : 'Up next'}</span>
              <span className="action-title">
                <InlineText text={targetQuestion.title} />
              </span>
              <span className="action-meta">
                {targetSection.title} · {targetQuestion.minutes} min
                <Icon name="arrowRight" size={18} />
              </span>
            </button>
          ) : (
            <div className="action-card is-primary">
              <span className="action-label">Loop complete</span>
              <span className="action-title">Every question is marked done.</span>
              <span className="action-meta">Keep them fresh in Review.</span>
            </div>
          )}

          {features.review ? (
          <button type="button" className="action-card" onClick={() => navigate({ name: 'review' })}>
            <span className="action-label">Review</span>
            <span className="action-title">
              {stats.due === 0 ? 'Nothing due right now' : `${plural(stats.due, 'answer')} due for a refresher`}
            </span>
            <span className="action-meta">
              Done answers come back after 2, 5, 12, 30 and 75 days
              <Icon name="arrowRight" size={18} />
            </span>
          </button>
          ) : null}

          {features.levelOverview ? (
          <dl className="level-split">
            {byLevel.map(({ level, total: levelTotal, done: levelDone }) => (
              <div key={level}>
                <dt>{LEVEL_LABEL[level]}</dt>
                <dd className="tabular">
                  {levelDone}/{levelTotal}
                </dd>
                <ProgressBar value={levelDone} max={levelTotal} label={`${LEVEL_LABEL[level]} questions done`} />
              </div>
            ))}
          </dl>
          ) : null}
        </div>
      </section>

      <section className="rounds" aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="section-heading">
          Topics in this plan
        </h2>
        {mine.length === 0 ? (
          <div className="rounds-empty">
            <p>
              No topics match {facets.length > 0 ? describeSelection(facets) : 'this plan'} yet. Widen the plan, or tell us what you&rsquo;d want
              covered first.
            </p>
            <div className="button-row">
              <button type="button" className="btn" onClick={() => openPlanEditor(plan.id)}>
                Edit plan
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setSuggesting(true)}>
                Suggest a topic
              </button>
            </div>
          </div>
        ) : null}
        <ol className="round-list">
          {segments.map(({ section, done: sectionDone }) => (
            <li key={section.id}>
              <button
                type="button"
                className="round"
                data-complete={sectionDone === section.questions.length}
                onPointerEnter={() => preloadSection(section.id)}
                onFocus={() => preloadSection(section.id)}
                onClick={() => navigate({ name: 'section', sectionId: section.id })}
              >
                <span className="round-index tabular">{String(numbers.get(section.id) ?? 0).padStart(2, '0')}</span>
                <span className="round-body">
                  <span className="round-title">
                    {section.title}
                    {isGrowing(section.questions.length) ? <span className="growing-chip">More coming</span> : null}
                  </span>
                  <span className="round-desc">{section.description}</span>
                  <FacetTags facets={section.facets} />
                </span>
                <span className="round-progress">
                  <span className="tabular">
                    {sectionDone}/{section.questions.length}
                  </span>
                  <ProgressBar value={sectionDone} max={section.questions.length} label={`${section.title} progress`} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <SuggestTopicDialog open={suggesting} onClose={() => setSuggesting(false)} />
    </article>
  );
}

/** Small labels on a topic card for what it is specific to (language, framework, platform, or a role other than the default). */
function FacetTags({ facets }: { facets: readonly string[] }) {
  const specific = facets.filter((id) => groupOf(id)?.id !== 'role');
  if (specific.length === 0) return null;
  return (
    <span className="facet-tags">
      {specific.map((id) => (
        <span key={id} className="facet-tag">
          {facetLabel(id)}
        </span>
      ))}
    </span>
  );
}
