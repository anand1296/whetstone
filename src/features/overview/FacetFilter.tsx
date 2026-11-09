import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import {
  describeSelection,
  facetCounts,
  filterSections,
  focusChips,
  isRoleId,
  normalizeSelection,
  ROLE_FACETS,
} from '../../content/facets.ts';
import type { SectionMeta } from '../../content/types.ts';
import { plural } from '../../lib/format.ts';

/**
 * "What are you preparing for?": the way into the question bank, in two steps.
 *
 * 1. Role: Frontend, Backend, Data engineering... one or several (a full-stack
 *    engineer picks Frontend and Backend).
 * 2. Focus areas: chips for what that role is made of: languages, frameworks and
 *    subjects (JavaScript, React, Machine coding, System design, Performance...).
 *    Pick any to narrow; pick none to see everything for the role.
 *
 * Roles and chips with no published topic yet stay visible but disabled with a
 * "Coming soon" tooltip, so people can see where the bank is going.
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
  const roleCounts = useMemo(() => facetCounts(sections), [sections]);
  const chips = useMemo(() => focusChips(sections, selected), [sections, selected]);
  const selectedRoles = selected.filter(isRoleId);
  // Touch screens have no hover: tapping a disabled pill pins its tooltip for a moment.
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => {
    if (!pinned) return undefined;
    const timer = window.setTimeout(() => setPinned(null), 2200);
    return () => window.clearTimeout(timer);
  }, [pinned]);

  const toggle = (id: string): void => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    onChange(normalizeSelection(sections, next));
  };

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
        <p className="track-sub">Pick your role, then the areas you want to focus on. Topics, progress and &ldquo;up next&rdquo; follow your choice.</p>
      </div>

      <div className="track-pills" role="group" aria-label="Role">
        <button type="button" className="track" aria-pressed={selectedRoles.length === 0} onClick={() => onChange([])}>
          Everything
          <span className="chip-count tabular">{sections.length}</span>
        </button>
        {ROLE_FACETS.map((role) => {
          const count = roleCounts.get(role.id) ?? 0;
          if (count === 0) return soon(`role-${role.id}`, role.label, 'track');
          return (
            <button key={role.id} type="button" className="track" aria-pressed={selected.includes(role.id)} onClick={() => toggle(role.id)}>
              {role.label}
              <span className="chip-count tabular" aria-label={`, ${plural(count, 'topic')}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {chips.length > 1 ? (
        <div className="focus-row" role="group" aria-label="Focus areas">
          <p className="focus-label">
            Focus areas <span>pick any, or none for everything in {selectedRoles.map((id) => ROLE_FACETS.find((r) => r.id === id)?.label).join(' + ')}</span>
          </p>
          <span className="focus-chips">
            {chips.map(({ facet, count, soon: isSoon }) =>
              isSoon ? (
                soon(facet.id, facet.label, 'chip')
              ) : (
                <button key={facet.id} type="button" className="chip" aria-pressed={selected.includes(facet.id)} onClick={() => toggle(facet.id)}>
                  {facet.label}
                  <span className="chip-count tabular" aria-label={`, ${plural(count, 'topic')}`}>
                    {count}
                  </span>
                </button>
              ),
            )}
          </span>
        </div>
      ) : null}

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
