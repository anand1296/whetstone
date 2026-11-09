/**
 * The filter taxonomy ("facets"). The list itself lives in content/facets.json so
 * the browser, the content compiler and the Go backend all read one source.
 *
 * A topic (a page of questions, like Performance) carries one or more *roles*
 * (`frontend`, `backend`, `sre`...) and any number of *focus areas*: a language
 * (`javascript`, `go`), a framework (`react`), a subject (`performance`,
 * `machine-coding`, `system-design`) or a platform (`aws`).
 *
 * People first pick who they are preparing as (one or several roles), then
 * optionally narrow with focus-area chips. A chip is *live* while a published topic
 * under the chosen role carries it; a chip a role has announced but has no topic yet
 * (Angular, Vue...) renders disabled with a "Coming soon" tooltip, so publishing a
 * topic tagged `angular` lights it up with no UI change.
 */
import taxonomy from '../../content/facets.json' with { type: 'json' };
import type { SectionMeta } from './types.ts';

export interface Facet {
  id: string;
  label: string;
  /** Focus areas only: the roles this chip is offered under (also while it is still "coming soon"). */
  roles?: string[];
}

export interface FacetGroup {
  id: string;
  label: string;
  facets: Facet[];
}

export const FACET_GROUPS: FacetGroup[] = taxonomy.groups;

const ROLE_GROUP = 'role';

const ALL_FACETS: Facet[] = FACET_GROUPS.flatMap((group) => group.facets);
const ROLES: Facet[] = FACET_GROUPS.find((group) => group.id === ROLE_GROUP)?.facets ?? [];
/** Every group except Role, in display order: these are the focus-area chips. */
const FOCUS: Facet[] = FACET_GROUPS.filter((group) => group.id !== ROLE_GROUP).flatMap((group) => group.facets);

export const ROLE_FACETS: readonly Facet[] = ROLES;

export function isFacetId(value: string): boolean {
  return ALL_FACETS.some((facet) => facet.id === value);
}

export function isRoleId(value: string): boolean {
  return ROLES.some((facet) => facet.id === value);
}

export function facetLabel(id: string): string {
  return ALL_FACETS.find((facet) => facet.id === id)?.label ?? id;
}

export function groupOf(id: string): FacetGroup | undefined {
  return FACET_GROUPS.find((group) => group.facets.some((facet) => facet.id === id));
}

/** Facet id -> number of topics that carry it. */
export function facetCounts(sections: readonly SectionMeta[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const section of sections) {
    for (const facet of section.facets) counts.set(facet, (counts.get(facet) ?? 0) + 1);
  }
  return counts;
}

const split = (selected: readonly string[]) => ({
  roles: selected.filter(isRoleId),
  focus: selected.filter((id) => !isRoleId(id) && isFacetId(id)),
});

/**
 * Which topics to show for a selection.
 *
 * - Role is strict: a topic must carry one of the selected roles. Several roles widen
 *   the result (Frontend + Backend for a full-stack engineer). No role = everything.
 * - Focus-area chips widen too: a topic is kept when it carries *any* selected chip,
 *   so "React + Performance" is the React topics plus the Performance topic. No chip
 *   = every topic for the role.
 */
export function filterSections<T extends SectionMeta>(sections: readonly T[], selected: readonly string[]): T[] {
  const { roles, focus } = split(selected);
  return sections.filter(
    (section) =>
      (roles.length === 0 || roles.some((id) => section.facets.includes(id))) &&
      (focus.length === 0 || focus.some((id) => section.facets.includes(id))),
  );
}

export interface FocusChip {
  facet: Facet;
  /** Topics under the chosen roles that carry it. */
  count: number;
  soon: boolean;
}

/** The focus-area chips to offer for the chosen roles: live ones first-class, announced-but-empty ones as "coming soon". */
export function focusChips(sections: readonly SectionMeta[], selected: readonly string[]): FocusChip[] {
  const { roles } = split(selected);
  if (roles.length === 0) return [];
  const inRole = filterSections(sections, roles);
  const counts = facetCounts(inRole);
  const chips: FocusChip[] = [];
  for (const facet of FOCUS) {
    const count = counts.get(facet.id) ?? 0;
    if (count > 0) chips.push({ facet, count, soon: false });
    else if (facet.roles?.some((id) => roles.includes(id))) chips.push({ facet, count: 0, soon: true });
  }
  return chips;
}

/** Drops focus chips that don't apply to the chosen roles (after the role changed). */
export function normalizeSelection(sections: readonly SectionMeta[], selected: readonly string[]): string[] {
  const { roles, focus } = split(selected);
  const live = new Set(focusChips(sections, roles).filter((chip) => !chip.soon).map((chip) => chip.facet.id));
  return [...roles, ...focus.filter((id) => live.has(id))];
}

/** "Frontend · React, Performance" style summary of a selection, for headings and empty states. */
export function describeSelection(selected: readonly string[]): string {
  const { roles, focus } = split(selected);
  const left = roles.map(facetLabel).join(' + ');
  const right = focus.map(facetLabel).join(', ');
  return [left, right].filter(Boolean).join(' · ');
}
