import { useEffect, useId, useMemo, useState } from 'react';
import { facetCounts, focusChips, isRoleId, normalizeSelection, ROLE_FACETS } from '../../content/facets.ts';
import type { SectionMeta } from '../../content/types.ts';
import { plural } from '../../lib/format.ts';
import { formatStudyTime } from '../../lib/format.ts';
import { planSections } from '../../state/plans.ts';

/**
 * Choosing what a plan covers, in two steps.
 *
 * 1. Role: Frontend, Backend, Design... one or several (a full-stack engineer picks Frontend and Backend).
 * 2. Focus areas: chips for what that role is made of: languages, frameworks, platforms and subjects
 *    (Go, React, Kubernetes, Performance...). Pick any to narrow; pick none to take everything for the role.
 *
 * Roles and chips with no published topic yet stay visible but disabled with a "Coming soon" tooltip,
 * so people can see where the bank is going. A live line says how many topics and questions the
 * selection adds up to, so the plan's size is never a surprise.
 */
export function PlanPicker({
  sections,
  selected,
  onChange,
}: {
  sections: readonly SectionMeta[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const baseId = useId();
  const roleCounts = useMemo(() => facetCounts(sections), [sections]);
  const chips = useMemo(() => focusChips(sections, selected), [sections, selected]);
  const selectedRoles = selected.filter(isRoleId);
  const included = useMemo(() => planSections(sections, { facets: [...selected] }), [sections, selected]);
  const questions = useMemo(() => included.flatMap((section) => section.questions), [included]);
  const minutes = useMemo(() => questions.reduce((sum, q) => sum + q.minutes, 0), [questions]);
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
    <div className="plan-picker">
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

      <p className="facet-status plan-size" role="status">
        {included.length === 0
          ? 'No topics match this yet. Try fewer filters.'
          : `${plural(included.length, 'topic')} · ${plural(questions.length, 'question')} · about ${formatStudyTime(minutes)} of study`}
      </p>
    </div>
  );
}
