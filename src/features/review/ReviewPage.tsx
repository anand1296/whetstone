import { useCallback, useMemo, useState } from 'react';
import { useContent } from '../../content/index.ts';
import { formatDayDistance, plural } from '../../lib/format.ts';
import { REVIEW_INTERVAL_DAYS } from '../../lib/srs.ts';
import { prefsStore } from '../../state/prefs.ts';
import { progressStore } from '../../state/progressStore.ts';
import { dueQuestions, upcomingQuestions } from '../../state/selectors.ts';
import { navigate } from '../../state/route.ts';
import { useStore } from '../../state/useStore.ts';
import { InlineText } from '../../components/primitives.tsx';
import { useActivePlan } from '../plans/usePlans.ts';
import { QuestionItem } from '../section/QuestionItem.tsx';

export function ReviewPage() {
  const progress = useStore(progressStore, (s) => s.questions);
  const practiceMode = useStore(prefsStore, (p) => p.practiceMode);
  // Freeze "now" for this visit so answers you just reviewed slide out
  // (their dueAt moves forward) while the list stays otherwise stable.
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  const { allQuestions, sectionsById } = useContent();
  // Review follows the plan you are working in. Answers you finished in topics outside it stay one click away.
  const { plan, sections: planTopics } = useActivePlan();
  const [everything, setEverything] = useState(false);
  const scoped = plan !== null && !everything;
  const pool = useMemo(() => (scoped ? planTopics.flatMap((section) => section.questions) : allQuestions), [scoped, planTopics, allQuestions]);
  const due = useMemo(() => dueQuestions(pool, progress, now), [pool, progress, now]);
  const upcoming = useMemo(() => upcomingQuestions(pool, progress, now, 14), [pool, progress, now]);
  const outside = useMemo(
    () => (scoped ? dueQuestions(allQuestions, progress, now).length - due.length : 0),
    [scoped, allQuestions, progress, now, due.length],
  );

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <article className="page review-page">
      <header className="page-header">
        <p className="eyebrow">{scoped && plan ? `Spaced review · ${plan.name}` : 'Spaced review'}</p>
        <h1>{due.length === 0 ? 'You are up to date' : `${plural(due.length, 'answer')} to refresh`}</h1>
        <p className="lede">
          Answers you mark done come back after {REVIEW_INTERVAL_DAYS.slice(0, -1).join(', ')} and{' '}
          {REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1]} days. Say each one out loud, then grade yourself. Again puts it
          back on your to-do list, Hard repeats the gap, Good moves to the next one and Easy skips ahead.
        </p>
      </header>

      {outside > 0 ? (
        <p className="review-scope">
          {plural(outside, 'more answer')} due in topics outside this plan.{' '}
          <button type="button" className="link-btn" onClick={() => setEverything(true)}>
            Review them too
          </button>
        </p>
      ) : null}
      {everything && plan ? (
        <p className="review-scope">
          Showing every plan&rsquo;s answers.{' '}
          <button type="button" className="link-btn" onClick={() => setEverything(false)}>
            Back to {plan.name}
          </button>
        </p>
      ) : null}

      {due.length > 0 ? (
        <ol className="q-list">
          {due.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              open={open.has(question.id)}
              onToggle={toggle}
              practiceMode={practiceMode}
              variant="review"
            />
          ))}
        </ol>
      ) : (
        <div className="empty">
          <p>Nothing is due. Mark answers as done in any topic and they will show up here when it is time to revisit them.</p>
        </div>
      )}

      {upcoming.length > 0 ? (
        <section className="upcoming" aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="section-heading">
            Coming up in the next two weeks
          </h2>
          <ul className="upcoming-list">
            {upcoming.map((question) => (
              <li key={question.id}>
                <button
                  type="button"
                  className="upcoming-item"
                  onClick={() => navigate({ name: 'section', sectionId: question.sectionId, questionId: question.id })}
                >
                  <span className="upcoming-title">
                    <InlineText text={question.title} />
                  </span>
                  <span className="upcoming-meta">
                    {sectionsById.get(question.sectionId)?.title} · {formatDayDistance(progress[question.id]?.dueAt ?? now, now)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
