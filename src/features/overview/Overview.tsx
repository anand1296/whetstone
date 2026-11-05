import { useMemo, useState } from 'react';
import { preloadSection, useContent } from '../../content/index.ts';
import { describeSelection, facetLabel, filterSections, groupOf } from '../../content/facets.ts';
import { LEVELS, LEVEL_LABEL } from '../../content/types.ts';
import { isGrowing } from '../../content/coverage.ts';
import { Icon } from '../../components/Icon.tsx';
import { LoopRing } from '../../components/LoopRing.tsx';
import { InlineText, ProgressBar } from '../../components/primitives.tsx';
import { formatStudyTime, plural } from '../../lib/format.ts';
import { prefsStore, updatePrefs } from '../../state/prefs.ts';
import { progressStore } from '../../state/progressStore.ts';
import { continueTarget, doneCount, dueQuestions } from '../../state/selectors.ts';
import { navigate } from '../../state/route.ts';
import { useStore } from '../../state/useStore.ts';
import { useServer } from '../../platform/backend.ts';
import { SuggestTopicDialog } from '../contribute/SuggestTopic.tsx';
import { FacetFilter } from './FacetFilter.tsx';

export function Overview() {
  const { allQuestions, questionsById, sections, sectionsById } = useContent();
  const state = useStore(progressStore, (s) => s);
  const { features, site } = useServer();
  const [now] = useState(() => Date.now());
  const selectedFacets = useStore(prefsStore, (s) => s.facets);
  const [suggesting, setSuggesting] = useState(false);

  // A remembered facet can lose its content (a topic was hidden): only filter by facets that still match something.
  const activeFacets = useMemo(
    () => selectedFacets.filter((id) => sections.some((section) => section.facets.includes(id))),
    [selectedFacets, sections],
  );
  // Everything below (progress, "up next", levels) follows the chosen track, not the whole bank.
  const mine = useMemo(() => filterSections(sections, activeFacets), [sections, activeFacets]);
  const segments = useMemo(
    () => mine.map((section) => ({ section, done: doneCount(section.questions, state.questions) })),
    [mine, state.questions],
  );
  const numbers = useMemo(() => new Map(sections.map((section, index) => [section.id, index + 1])), [sections]);
  const questions = useMemo(() => mine.flatMap((section) => section.questions), [mine]);
  const minutes = useMemo(() => questions.reduce((sum, q) => sum + q.minutes, 0), [questions]);
  const done = segments.reduce((sum, s) => sum + s.done, 0);
  const total = questions.length;
  const due = useMemo(() => dueQuestions(allQuestions, state.questions, now), [allQuestions, state.questions, now]);
  const target = useMemo(() => continueTarget(mine, state), [mine, state]);
  const targetQuestion = target ? questionsById.get(target.questionId) : undefined;
  const targetSection = target ? sectionsById.get(target.sectionId) : undefined;
  const filtering = activeFacets.length > 0;

  const byLevel = LEVELS.map((level) => {
    const ofLevel = questions.filter((q) => q.level === level);
    return { level, total: ofLevel.length, done: doneCount(ofLevel, state.questions) };
  });

  return (
    <article className="page overview">
      <header className="overview-hero">
        <div className="overview-intro">
          <p className="eyebrow">Junior to principal engineering interviews</p>
          <h1>{site.tagline || 'Your interview loop, one topic at a time.'}</h1>
          <p className="lede">
            {plural(total, 'question')} across {plural(mine.length, 'topic')}
            {filtering ? ` for ${describeSelection(activeFacets)}` : ''}, about {formatStudyTime(minutes)} of study. Read the
            question, answer it out loud, then open it and compare. Tick it off when you could say it in the room.
          </p>
        </div>
      </header>

      <FacetFilter
        sections={sections}
        selected={activeFacets}
        shown={mine.length}
        onChange={(facets) => updatePrefs({ facets })}
        onSuggest={() => setSuggesting(true)}
      />

      <section className="overview-grid" aria-label={filtering ? `Your progress: ${describeSelection(activeFacets)}` : 'Your progress'}>
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
              {due.length === 0 ? 'Nothing due right now' : `${plural(due.length, 'answer')} due for a refresher`}
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
          {filtering ? `Topics for ${describeSelection(activeFacets)}` : 'All topics'}
        </h2>
        {mine.length === 0 ? (
          <div className="rounds-empty">
            <p>
              No topics match {describeSelection(activeFacets)} yet. Try fewer filters, or tell us what you&rsquo;d want covered first.
            </p>
            <div className="button-row">
              <button type="button" className="btn" onClick={() => updatePrefs({ facets: [] })}>
                Show everything
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
