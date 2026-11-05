/**
 * "Suggest a topic": propose a new category (a topic) with a few optional
 * starter questions. An admin reviews it (Admin → Topic ideas); accepting
 * creates a draft topic, and the person can follow it from "your suggestions"
 * until the answers are written and live.
 *
 * Signed in (server mode): a form here. Signed out: a GitHub sign-in prompt.
 * Static builds (no backend): a pre-filled GitHub issue, like questions.
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { repoUrl } from 'virtual:walkthroughs';
import { Dialog } from '../../components/primitives.tsx';
import { Icon } from '../../components/Icon.tsx';
import { FacetPicker } from '../../components/FacetPicker.tsx';
import { facetLabel } from '../../content/facets.ts';
import { api, ApiError } from '../../platform/api.ts';
import { signInUrl, useServer } from '../../platform/backend.ts';
import { navigate } from '../../state/route.ts';
import type { Idea, IdeaInput, IdeaStage } from '../console/consoleApi.ts';

const MAX_QUESTIONS = 5;

function message(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = error.problems.map((p) => p.message).join(' ');
    return fields || error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function SuggestTopicDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const server = useServer();
  return (
    <Dialog open={open} onClose={onClose} label="Suggest a topic" className="dialog dialog-suggest">
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>Suggest a topic</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {server.mode !== 'server' ? (
          <StaticSuggest />
        ) : !server.user ? (
          <div className="suggest-gate">
            <p>
              Sign in with GitHub to suggest a topic. It goes to the owner for review, and you can follow it from the Contribute page.
            </p>
            <a className="btn btn-primary btn-github" href={signInUrl()}>
              Sign in with GitHub
            </a>
          </div>
        ) : !server.features.contribute ? (
          <p className="admin-note">Suggestions are paused right now.</p>
        ) : (
          <TopicForm
            onDone={() => {
              /* the form shows its own confirmation */
            }}
            onClose={onClose}
          />
        )}
      </div>
    </Dialog>
  );
}

function StaticSuggest() {
  return (
    <div className="suggest-gate">
      <p>
        This copy has no backend, so suggestions go through GitHub: a short form that opens as an issue. The owner reviews it, and
        if it fits, the topic is added in a later release.
      </p>
      <a className="btn btn-primary" href={`${repoUrl}/issues/new?template=topic.yml`} target="_blank" rel="noopener noreferrer">
        Suggest it on GitHub <Icon name="external" size={14} />
      </a>
    </div>
  );
}

export function TopicForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [facets, setFacets] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);
  const [credit, setCredit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Idea | null>(null);

  const setQuestion = (index: number, value: string): void => setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)));

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input: IdeaInput = { title, facets, details, questions: questions.map((q) => q.trim()).filter(Boolean), credit };
    try {
      setSent(await api<Idea>('/ideas', { method: 'POST', body: input }));
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="suggest-done" role="status">
        <h3>Thanks, it&rsquo;s with the owner.</h3>
        <p>
          &ldquo;{sent.title}&rdquo; is waiting for review. If it fits, the answers get written in the same depth as the rest of the
          bank and it goes live here. You&rsquo;ll get an email when it&rsquo;s reviewed, and you can follow it any time.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate({ name: 'contribute' });
            }}
          >
            Follow it on Contribute
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="console-form suggest-form" onSubmit={(event) => void submit(event)}>
      <p className="admin-note">
        Missing a category you&rsquo;d be asked about, say Kubernetes for SREs or Go concurrency for backend? Tell us. Only the name is
        required.
      </p>
      <label htmlFor={`${formId}-title`}>
        What should we cover?
        <input
          id={`${formId}-title`}
          value={title}
          required
          minLength={3}
          maxLength={80}
          placeholder="e.g. Kubernetes for SREs"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <FacetPicker value={facets} onChange={setFacets} max={6} label="Where does it belong? (optional)" />
      <label htmlFor={`${formId}-details`}>
        Why it matters, what it should cover (optional)
        <textarea id={`${formId}-details`} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <fieldset className="suggest-questions">
        <legend>Starter questions (optional)</legend>
        <p className="admin-note">Questions you were asked, or would ask. One line each; the answers are written by us if it&rsquo;s accepted.</p>
        {questions.map((value, index) => (
          <input
            key={index}
            value={value}
            maxLength={200}
            aria-label={`Starter question ${index + 1}`}
            placeholder="e.g. How do liveness and readiness probes differ?"
            onChange={(e) => setQuestion(index, e.target.value)}
          />
        ))}
        {questions.length < MAX_QUESTIONS ? (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setQuestions((prev) => [...prev, ''])}>
            + Add another question
          </button>
        ) : null}
      </fieldset>
      <label className="switch-inline" htmlFor={`${formId}-credit`}>
        <input id={`${formId}-credit`} type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
        Credit me on the questions (shows your GitHub handle)
      </label>
      {error ? (
        <p className="settings-message is-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send for review'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- tracking */

export const STAGE_LABEL: Record<IdeaStage, string> = {
  review: 'In review',
  writing: 'Answers being written',
  live: 'Live',
  declined: 'Not added',
  withdrawn: 'Withdrawn',
};

const STEPS = ['Sent', 'Accepted', 'Writing answers', 'Live'] as const;
const STEP_AT: Record<IdeaStage, number> = { review: 0, writing: 2, live: 3, declined: -1, withdrawn: -1 };

/** The four-step progress line: Sent, Accepted, Writing answers, Live. */
export function IdeaProgress({ stage }: { stage: IdeaStage }) {
  const at = STEP_AT[stage];
  if (at < 0) return null;
  return (
    <ol className="idea-steps" aria-label={`Progress: ${STAGE_LABEL[stage]}`}>
      {STEPS.map((step, index) => (
        <li key={step} data-state={index < at ? 'done' : index === at ? 'current' : 'todo'} aria-current={index === at ? 'step' : undefined}>
          {step}
        </li>
      ))}
    </ol>
  );
}

const QUESTION_STATE: Record<Idea['questions'][number]['state'], string> = {
  queued: 'Queued',
  writing: 'Being written',
  live: 'Live',
};

export function IdeaQuestions({ idea }: { idea: Idea }) {
  if (idea.questions.length === 0) return null;
  return (
    <ul className="idea-questions">
      {idea.questions.map((q) => (
        <li key={q.id}>
          <span>{q.title}</span>
          <span className="status-chip" data-status={q.state}>
            {QUESTION_STATE[q.state]}
          </span>
          {q.state === 'live' && q.questionId ? (
            <a className="btn btn-quiet btn-small" href={`#${q.questionId}`}>
              Open
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function MyIdeas({ items, onChange }: { items: Idea[]; onChange: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const withdraw = async (id: number): Promise<void> => {
    if (!window.confirm('Withdraw this suggestion?')) return;
    try {
      await api(`/me/ideas/${id}`, { method: 'DELETE' });
      await onChange();
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <section aria-labelledby="ideas-heading">
      <h2 id="ideas-heading" className="section-heading">
        Your topic suggestions
      </h2>
      {error ? (
        <p className="settings-message is-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="contrib-list idea-list">
        {items.map((idea) => (
          <li key={idea.id}>
            <span className="contrib-title">
              {idea.title}
              <span className="contrib-sub">
                {idea.facets.length > 0 ? `${idea.facets.map(facetLabel).join(', ')} · ` : ''}sent {dateFormat.format(new Date(idea.createdAt))}
              </span>
            </span>
            <span className="status-chip" data-status={idea.stage}>
              {STAGE_LABEL[idea.stage]}
            </span>
            {idea.stage === 'review' ? (
              <button type="button" className="btn btn-quiet" onClick={() => void withdraw(idea.id)}>
                Withdraw
              </button>
            ) : null}
            {idea.stage === 'live' && idea.sectionId ? (
              <a className="btn btn-quiet" href={`#${idea.sectionId}`}>
                Open the topic
              </a>
            ) : null}
            <div className="idea-detail">
              <IdeaProgress stage={idea.stage} />
              <IdeaQuestions idea={idea} />
              {idea.reviewNote ? <p className="contrib-note">Reviewer&rsquo;s note: {idea.reviewNote}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Loads the signed-in person's suggestions; returns null in static mode. */
export function useMyIdeas(enabled: boolean): { items: Idea[] | null; reload: () => Promise<void> } {
  const [items, setItems] = useState<Idea[] | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setItems(await api<Idea[]>('/me/ideas'));
    } catch {
      setItems([]);
    }
  }, [enabled]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { items, reload };
}
