/**
 * Topic ideas: new categories people suggested, with optional starter questions.
 *
 * The workflow is deliberately short:
 *   1. Review: accept (create a draft topic and a draft question per starter
 *      question) or decline with a note.
 *   2. Write: copy the authoring brief, produce the answers, paste each into its
 *      draft in Content, and publish.
 * The person sees "In review" -> "Answers being written" -> "Live" without
 * anyone updating a status: it's derived from the drafts and their publish state.
 */
import { useCallback, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { FacetPicker } from '../../components/FacetPicker.tsx';
import { facetLabel } from '../../content/facets.ts';
import { LEVELS, LEVEL_LABEL, type Level } from '../../content/types.ts';
import { ApiError } from '../../platform/api.ts';
import { refreshBootstrap } from '../../platform/backend.ts';
import { IdeaProgress, IdeaQuestions, STAGE_LABEL } from '../contribute/SuggestTopic.tsx';
import { authoringBrief } from './ideaBrief.ts';
import { consoleApi, type AdminContent, type Idea } from './consoleApi.ts';
import { Card, copyText, errorMessage, FlashLine, formatDate, LoadState, slugify, useAction, useAsync, type Flash } from './shared.tsx';

type Filter = 'pending' | 'open' | 'all';

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'pending', label: 'Waiting for review' },
  { value: 'open', label: 'Being written' },
  { value: 'all', label: 'All' },
];

const EMPTY_COPY: Record<Filter, string> = {
  pending: 'Nothing waiting. 🎉',
  open: 'No accepted facets are waiting for answers.',
  all: 'No topic ideas yet.',
};

export function IdeasTab({ onOpenContent }: { onOpenContent: () => void }) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [selected, setSelected] = useState<Idea | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const load = useCallback(() => consoleApi.ideas(filter), [filter]);
  const list = useAsync(load);
  const content = useAsync(consoleApi.content);

  const done = async (text: string, next?: Filter): Promise<void> => {
    setSelected(null);
    setFlash({ kind: 'ok', text });
    if (next && next !== filter) setFilter(next);
    await Promise.all([list.reload(), content.reload(), refreshBootstrap()]);
  };

  if (selected && content.status === 'ready') {
    return <Review key={selected.id} idea={selected} content={content.data} onClose={() => setSelected(null)} onDone={done} />;
  }

  return (
    <Card
      title="Topic ideas"
      icon={<Icon name="megaphone" />}
      actions={
        <div className="segmented" role="radiogroup" aria-label="Show">
          {FILTERS.map(({ value, label }) => (
            <button key={value} type="button" role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      <p className="admin-note">
        New categories people suggested, with optional starter questions. Accept one to create a draft topic and draft questions;
        then write the answers (copy the brief) and publish. The person follows the progress on their own, and is emailed when you
        decide.
      </p>
      <FlashLine flash={flash} />
      <LoadState state={list}>
        {(ideas) =>
          ideas.length === 0 ? (
            <p className="admin-note">{EMPTY_COPY[filter]}</p>
          ) : (
            <ul className="contrib-list idea-list">
              {ideas.map((idea) => (
                <IdeaRow key={idea.id} idea={idea} canReview={content.status === 'ready'} onReview={() => setSelected(idea)} onOpenContent={onOpenContent} />
              ))}
            </ul>
          )
        }
      </LoadState>
    </Card>
  );
}

function IdeaRow({ idea, canReview, onReview, onOpenContent }: { idea: Idea; canReview: boolean; onReview: () => void; onOpenContent: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copyBrief = async (): Promise<void> => {
    setCopied(await copyText(authoringBrief(idea)));
    window.setTimeout(() => setCopied(null), 2500);
  };
  return (
    <li>
      <span className="contrib-title">
        {idea.title}
        <span className="contrib-sub">
          @{idea.submitter} · {idea.facets.length > 0 ? idea.facets.map(facetLabel).join(', ') : 'no chips'} ·{' '}
          {idea.questions.length === 0 ? 'no starter questions' : `${idea.questions.length} starter question${idea.questions.length === 1 ? '' : 's'}`} ·{' '}
          {formatDate(idea.createdAt)}
        </span>
      </span>
      <span className="status-chip" data-status={idea.stage}>
        {STAGE_LABEL[idea.stage]}
      </span>
      {idea.stage === 'review' ? (
        <button type="button" className="btn btn-primary" onClick={onReview} disabled={!canReview}>
          Review
        </button>
      ) : null}
      {idea.stage === 'writing' ? (
        <>
          <button type="button" className="btn" onClick={() => void copyBrief()}>
            <Icon name="note" size={16} /> {copied === true ? 'Copied' : copied === false ? 'Copy failed' : 'Copy authoring brief'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onOpenContent}>
            Write in Content
          </button>
        </>
      ) : null}
      {idea.stage === 'live' && idea.sectionId ? (
        <a className="btn btn-quiet" href={`#${idea.sectionId}`}>
          View
        </a>
      ) : null}
      <div className="idea-detail">
        {idea.details && idea.stage === 'review' ? <p className="contrib-note">{idea.details}</p> : null}
        <IdeaProgress stage={idea.stage} />
        <IdeaQuestions idea={idea} />
        {idea.stage === 'writing' && idea.sectionTitle ? (
          <p className="admin-note">
            Drafts live in the topic <strong>{idea.sectionTitle}</strong> (Content tab). Publishing the questions, then the topic,
            makes it live.
          </p>
        ) : null}
        {idea.reviewNote ? <p className="contrib-note">Note: {idea.reviewNote}</p> : null}
      </div>
    </li>
  );
}

type Target = 'new' | 'existing';

function Review({
  idea,
  content,
  onClose,
  onDone,
}: {
  idea: Idea;
  content: AdminContent;
  onClose: () => void;
  onDone: (message: string, next?: Filter) => Promise<void>;
}) {
  const formId = useId();
  const sections = content.sections;
  const taken = useMemo(() => new Set([...sections.map((s) => s.id), ...sections.flatMap((s) => s.questions.map((q) => q.id))]), [sections]);

  const [target, setTarget] = useState<Target>('new');
  const [title, setTitle] = useState(idea.title);
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState(idea.details.slice(0, 300));
  const [facets, setFacets] = useState<string[]>(idea.facets);
  const [existing, setExisting] = useState(sections[0]?.id ?? '');
  const [keep, setKeep] = useState<Record<number, { on: boolean; title: string; level: Level }>>(() =>
    Object.fromEntries(idea.questions.map((q) => [q.id, { on: true, title: q.title, level: 'senior' as Level }])),
  );
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const { busy, flash, setFlash, run } = useAction();

  const effectiveId = idTouched ? id : slugify(title);
  const idTaken = target === 'new' && taken.has(effectiveId);

  const accept = async (): Promise<void> => {
    setProblems({});
    const questions = idea.questions
      .filter((q) => keep[q.id]?.on)
      .map((q) => ({ ideaQuestionId: q.id, title: keep[q.id]?.title ?? q.title, level: keep[q.id]?.level ?? ('senior' as Level) }));
    try {
      await consoleApi.acceptIdea(idea.id, {
        ...(target === 'new' ? { newSection: { id: effectiveId, title, description, facets } } : { sectionId: existing }),
        questions,
        note,
      });
      await onDone(`Accepted “${idea.title}”. Drafts are ready: copy the authoring brief to write the answers. @${idea.submitter} has been told.`, 'open');
    } catch (error) {
      if (error instanceof ApiError && error.problems.length > 0) {
        setProblems(Object.fromEntries(error.problems.map((p) => [p.field, p.message])));
      }
      setFlash({ kind: 'error', text: errorMessage(error) });
    }
  };

  const decline = async (): Promise<void> => {
    if (!note.trim() && !window.confirm('Decline without a note? A short reason helps the person.')) return;
    const ok = await run(() => consoleApi.declineIdea(idea.id, note));
    if (ok) await onDone(`Declined “${idea.title}”. @${idea.submitter} has been told.`);
  };

  const fieldError = (field: string) => (problems[field] ? <span className="field-error">{problems[field]}</span> : null);

  return (
    <section className="admin-card editor" aria-label={`Review ${idea.title}`}>
      <div className="card-head">
        <h2 className="admin-card-title">
          <Icon name="megaphone" />
          Review topic idea
        </h2>
        <div className="card-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            <Icon name="close" size={16} /> Back to list
          </button>
        </div>
      </div>

      <p className="admin-note">
        From <strong>@{idea.submitter}</strong>
        {idea.submitterName ? ` (${idea.submitterName})` : ''} on {formatDate(idea.createdAt)}.{' '}
        {idea.credit ? 'They asked to be credited on the questions.' : 'They asked not to be credited.'}
      </p>
      <h3 className="idea-title">{idea.title}</h3>
      {idea.facets.length > 0 ? <p className="admin-note">Suggested chips: {idea.facets.map(facetLabel).join(', ')}</p> : null}
      {idea.details ? <blockquote className="admin-quote">{idea.details}</blockquote> : null}

      <fieldset className="review-target">
        <legend>Where does it go?</legend>
        <label className="switch-inline">
          <input type="radio" name={`${formId}-target`} checked={target === 'new'} onChange={() => setTarget('new')} /> A new topic
        </label>
        <label className="switch-inline">
          <input type="radio" name={`${formId}-target`} checked={target === 'existing'} onChange={() => setTarget('existing')} /> An existing topic
        </label>
      </fieldset>

      {target === 'new' ? (
        <div className="form-grid">
          <label htmlFor={`${formId}-title`} className="span-2">
            Topic title
            <input id={`${formId}-title`} value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
            {fieldError('newSection.title')}
          </label>
          <label htmlFor={`${formId}-id`}>
            Id <span className="you">(the URL; permanent)</span>
            <input
              id={`${formId}-id`}
              value={effectiveId}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              aria-invalid={idTaken}
              onChange={(e) => {
                setIdTouched(true);
                setId(e.target.value);
              }}
            />
            {idTaken ? <span className="field-error">Already used by another round or question.</span> : fieldError('newSection.id')}
          </label>
          <label htmlFor={`${formId}-desc`} className="span-2">
            One-line description
            <input id={`${formId}-desc`} value={description} maxLength={300} required onChange={(e) => setDescription(e.target.value)} />
            {fieldError('newSection.description')}
          </label>
          <div className="span-2">
            <FacetPicker value={facets} onChange={setFacets} label="Filters for this topic" />
            {fieldError('newSection.facets')}
            <p className="admin-note">A chip becomes selectable on the overview as soon as a published topic carries it.</p>
          </div>
        </div>
      ) : (
        <label htmlFor={`${formId}-existing`}>
          Topic
          <select id={`${formId}-existing`} value={existing} onChange={(e) => setExisting(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {fieldError('sectionId')}
        </label>
      )}

      {idea.questions.length > 0 ? (
        <fieldset className="review-questions">
          <legend>Starter questions: keep the ones that fit</legend>
          {idea.questions.map((q) => {
            const row = keep[q.id] ?? { on: true, title: q.title, level: 'senior' as Level };
            const patch = (change: Partial<typeof row>): void => setKeep((prev) => ({ ...prev, [q.id]: { ...row, ...change } }));
            return (
              <div key={q.id} className="review-question">
                <input type="checkbox" checked={row.on} aria-label={`Keep: ${q.title}`} onChange={(e) => patch({ on: e.target.checked })} />
                <input value={row.title} disabled={!row.on} maxLength={200} aria-label="Question" onChange={(e) => patch({ title: e.target.value })} />
                <select value={row.level} disabled={!row.on} aria-label="Level" onChange={(e) => patch({ level: e.target.value as Level })}>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {LEVEL_LABEL[level]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {fieldError('questions.title')}
        </fieldset>
      ) : (
        <p className="admin-note">No starter questions came with this one. You can add questions to the topic in Content after accepting.</p>
      )}

      <label htmlFor={`${formId}-note`} className="field-label">
        Note to @{idea.submitter} <span className="you">(optional; included in the email)</span>
      </label>
      <textarea id={`${formId}-note`} className="note-input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />

      <FlashLine flash={flash} />
      <div className="editor-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || idTaken || (target === 'new' ? !effectiveId || !title.trim() || !description.trim() : !existing)}
          onClick={() => void run(accept)}
        >
          <Icon name="check" size={16} /> Accept and create drafts
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void decline()}>
          Decline
        </button>
      </div>
      <p className="admin-note">Accepting creates hidden drafts only. Nothing is visible to learners until you publish the answers.</p>
    </section>
  );
}
