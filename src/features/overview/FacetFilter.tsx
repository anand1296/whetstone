import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { plural } from '../../lib/format.ts';
import { TOPIC_GROUPS, topicCounts } from '../../content/topics.ts';
import type { SectionMeta } from '../../content/types.ts';

/**
 * Topic chips above the rounds. A chip is selectable only while a published
 * round carries its topic; the rest stay visible but disabled with a "Coming
 * soon" tooltip, so people can see where the bank is going (and suggest it).
 *
 * Rows are groups (Role, Language, ...). Picking within a row widens the
 * result (React or Angular); picking across rows narrows it (Frontend and
 * TypeScript). Nothing selected means everything.
 */
export function TopicFilter({
  sections,
  selected,
  shown,
  onChange,
  onSuggest,
}: {
  sections: readonly SectionMeta[];
  selected: readonly string[];
  shown: number;
  onChange: (next: string[]) => void;
  onSuggest: () => void;
}) {
  const baseId = useId();
  const counts = useMemo(() => topicCounts(sections), [sections]);
  // Touch screens have no hover: tapping a disabled chip pins its tooltip for a moment.
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => {
    if (!pinned) return undefined;
    const timer = window.setTimeout(() => setPinned(null), 2200);
    return () => window.clearTimeout(timer);
  }, [pinned]);

  const toggle = (id: string): void => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <section className="topic-filter" aria-labelledby={`${baseId}-title`}>
      <div className="topic-filter-head">
        <h3 id={`${baseId}-title`} className="topic-filter-title">
          Filter by topic
        </h3>
        <span className="topic-filter-status" role="status">
          {selected.length === 0 ? `All ${plural(sections.length, 'round')}` : `${shown} of ${plural(sections.length, 'round')}`}
        </span>
        {selected.length > 0 ? (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onChange([])}>
            Clear
          </button>
        ) : null}
        <button type="button" className="btn btn-small topic-suggest" onClick={onSuggest}>
          <Icon name="megaphone" size={16} /> Suggest a topic
        </button>
      </div>

      <div className="topic-rows">
        {TOPIC_GROUPS.map((group) => (
          <div key={group.id} className="topic-row" role="group" aria-label={group.label}>
            <span className="topic-row-label" aria-hidden="true">
              {group.label}
            </span>
            <span className="topic-row-chips">
              {group.topics.map((topic) => {
                const count = counts.get(topic.id) ?? 0;
                if (count === 0) {
                  const tipId = `${baseId}-${topic.id}-tip`;
                  return (
                    <span key={topic.id} className="chip-wrap" data-pinned={pinned === topic.id}>
                      <button
                        type="button"
                        className="chip is-soon"
                        aria-disabled="true"
                        aria-describedby={tipId}
                        onClick={() => setPinned(topic.id)}
                      >
                        {topic.label}
                      </button>
                      <span id={tipId} role="tooltip" className="chip-tip">
                        Coming soon
                      </span>
                    </span>
                  );
                }
                const on = selected.includes(topic.id);
                return (
                  <button key={topic.id} type="button" className="chip" aria-pressed={on} onClick={() => toggle(topic.id)}>
                    {topic.label}
                    <span className="chip-count tabular" aria-label={`, ${plural(count, 'round')}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
