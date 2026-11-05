/**
 * "Generate answer with AI" for the question editors.
 *
 * It only drafts into the editor: nothing is saved or published until the admin reviews the text
 * and saves or approves it through the normal path (which validates it like any other answer).
 * Hidden entirely when the server has no AI key configured.
 */
import { useCallback, useId, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import type { Level } from '../../content/types.ts';
import { consoleApi, type AiAnswerRequest, type AiStatus } from './consoleApi.ts';
import { errorMessage, useAsync } from './shared.tsx';

interface Props {
  title: string;
  level: Level;
  sectionId: string;
  tags: string[];
  /** The current answer text. When there is real content the button says "Regenerate" and asks first. */
  body: string;
  context?: string;
  /** Text that counts as "no answer yet" (for example the starter template). */
  emptyBodies?: string[];
  onDraft: (body: string) => void;
}

export function AiAnswerButton({ title, level, sectionId, tags, body, context, emptyBodies = [], onDraft }: Props) {
  const id = useId();
  const load = useCallback(() => consoleApi.aiStatus(), []);
  const status = useAsync<AiStatus>(load);
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (status.status !== 'ready' || !status.data.configured) return null;
  const hasAnswer = body.trim() !== '' && !emptyBodies.some((empty) => empty.trim() === body.trim());
  const tooShort = title.trim().length < 8;

  const generate = async (): Promise<void> => {
    if (hasAnswer && !window.confirm('Replace the current answer with a new AI draft? You can undo with Ctrl/Cmd+Z in the editor, or discard changes before saving.')) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const request: AiAnswerRequest = {
      title,
      level,
      sectionId,
      tags,
      existingBody: hasAnswer ? body : undefined,
      context: context || undefined,
      guidance: guidance.trim() || undefined,
    };
    try {
      const result = await consoleApi.aiAnswer(request);
      onDraft(result.body);
      const warn = result.warnings.length > 0 ? ` Check before saving: ${result.warnings.map((w) => w.message).join('; ')}.` : '';
      setMessage({ kind: result.warnings.length > 0 ? 'error' : 'ok', text: `Drafted with ${result.model}. Read it, fix anything wrong, then save.${warn}` });
      void status.reload();
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const { usedToday = 0, dailyLimit = 0, model = '' } = status.data;
  return (
    <div className="ai-answer">
      <div className="ai-answer-row">
        <button type="button" className="btn" onClick={generate} disabled={busy || tooShort}>
          <Icon name="sparkle" size={16} />
          {busy ? 'Drafting…' : hasAnswer ? 'Regenerate answer with AI' : 'Generate answer with AI'}
        </button>
        <label htmlFor={`${id}-guidance`} className="sr-only">
          Guidance for the AI (optional)
        </label>
        <input
          id={`${id}-guidance`}
          className="ai-guidance"
          value={guidance}
          maxLength={400}
          placeholder="Optional steer: “focus on React 19”, “add a TypeScript example”…"
          onChange={(e) => setGuidance(e.target.value)}
        />
      </div>
      <p className="ai-note">
        Drafts with {model}; always verify facts and code before publishing. {usedToday} of {dailyLimit} daily AI drafts used.
      </p>
      {message ? (
        <p className={message.kind === 'error' ? 'settings-message is-error' : 'settings-message'} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
