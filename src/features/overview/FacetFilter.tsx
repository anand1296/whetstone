import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import {
  describeSelection,
  FACET_GROUPS,
  facetCounts,
  filterSections,
  matchingTrack,
  trackAvailable,
  TRACKS,
} from '../../content/facets.ts';
import type { SectionMeta } from '../../content/types.ts';
import { plural } from '../../lib/format.ts';

/**
 * "What are you preparing for?": the way into the question bank.
 *
 * Most people want one of a handful of goals (Frontend, Frontend · React, SRE,
 * Backend...), so those are one-tap *tracks*. Anything more specific lives under
 * "Fine-tune": individual facets in rows (Role, Language, Framework, Platform).
 * Facets and tracks with no published topic yet stay visible but disabled with a
 * "Coming soon" tooltip, so people can see where the bank is going.
 *
 * Picking within a row widens the result (React or Angular); across rows it narrows
 * it, but general topics (those with no tag in a row) always stay: see filterSections.
 */
export function FacetFilter({
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
  const counts = useMemo(() => facetCounts(sections), [sections]);
  const track = matchingTrack(selected);
  const custom = selected.length > 0 && !track;
  const [fineTune, setFineTune] = useState(custom);
  // Touch screens have no hover: tapping a disabled pill pins its tooltip for a moment.
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => {
    if (!pinned) return undefined;
    const timer = window.setTimeout(() => setPinned(null), 2200);
    return () => window.clearTimeout(timer);
  }, [pinned]);
  useEffect(() => {
    if (custom) setFineTune(true);
  }, [custom]);

  const toggle = (id: string): void => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const soon = (key: string, label: string, className: string) => {
    const tipId = `${baseId}-${key}-tip`;
    return (
      <span key={key} className="chip-wrap" data-pinned={pinned === key}>
        <button type="button" className={`${className} is-soon`} aria-disabled="true" aria-describedby={tipId} onClick={() => setPinned(key)}>
          {label}
        </button>
        <span id={tipId} role="tooltip" className="chip-tip">
          Coming soon
        </span>
      </span>
    );
  };

  return (
    <section className="track-picker" aria-labelledby={`${baseId}-title`}>
      <div className="track-head">
        <h2 id={`${baseId}-title`} className="section-heading">
          What are you preparing for?
        </h2>
        <p className="track-sub">Pick a track and the topics, progress and &ldquo;up next&rdquo; follow it. Everything else stays one tap away.</p>
      </div>

      <div className="track-pills" role="group" aria-label="Tracks">
        <button type="button" className="track" aria-pressed={selected.length === 0} onClick={() => onChange([])}>
          Everything
          <span className="chip-count tabular">{sections.length}</span>
        </button>
        {TRACKS.map((t) =>
          trackAvailable(t, counts) ? (
            <button key={t.id} type="button" className="track" aria-pressed={track?.id === t.id} onClick={() => onChange(track?.id === t.id ? [] : t.facets)}>
              {t.label}
              <span className="chip-count tabular" aria-label={`, ${plural(filterSections(sections, t.facets).length, 'topic')}`}>
                {filterSections(sections, t.facets).length}
              </span>
            </button>
          ) : (
            soon(`track-${t.id}`, t.label, 'track')
          ),
        )}
      </div>

      <details className="fine-tune" open={fineTune} onToggle={(event) => setFineTune(event.currentTarget.open)}>
        <summary>
          Fine-tune by role, language, framework or platform
          {selected.length > 0 ? <span className="chip-count tabular">{selected.length}</span> : null}
        </summary>
        <div className="facet-rows">
          {FACET_GROUPS.map((group) => (
            <div key={group.id} className="facet-row" role="group" aria-label={group.label}>
              <span className="facet-row-label" aria-hidden="true">
                {group.label}
              </span>
              <span className="facet-row-chips">
                {group.facets.map((facet) => {
                  const count = counts.get(facet.id) ?? 0;
                  if (count === 0) return soon(facet.id, facet.label, 'chip');
                  const on = selected.includes(facet.id);
                  return (
                    <button key={facet.id} type="button" className="chip" aria-pressed={on} onClick={() => toggle(facet.id)}>
                      {facet.label}
                      <span className="chip-count tabular" aria-label={`, ${plural(count, 'topic')}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
          <p className="facet-note">General topics (like Accessibility) stay in view when you pick a language, framework or platform.</p>
        </div>
      </details>

      <div className="track-foot">
        <span className="facet-status" role="status">
          {selected.length === 0
            ? `Showing all ${plural(sections.length, 'topic')}`
            : `Showing ${shown} of ${plural(sections.length, 'topic')} for ${describeSelection(selected)}`}
        </span>
        {selected.length > 0 ? (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onChange([])}>
            Clear
          </button>
        ) : null}
        <button type="button" className="btn btn-small facet-suggest" onClick={onSuggest}>
          <Icon name="megaphone" size={16} /> Suggest a topic
        </button>
      </div>
    </section>
  );
}
