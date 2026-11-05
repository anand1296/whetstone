/**
 * The filter taxonomy ("facets"). The list itself lives in content/facets.json so
 * the browser, the content compiler and the Go backend all read one source.
 *
 * A topic (a page of questions, like Performance) is tagged with facets such as
 * `frontend`, `react` or `sre`. People pick a *track* (a preset of facets such as
 * "Frontend · React") or fine-tune individual facets.
 *
 * A facet is *selectable* only while at least one published topic carries it;
 * the rest render disabled with a "Coming soon" tooltip. Publishing a topic
 * tagged `angular` therefore lights up the Angular facet and track with no UI change.
 */
import taxonomy from '../../content/facets.json' with { type: 'json' };
import type { SectionMeta } from './types.ts';

export interface Facet {
  id: string;
  label: string;
}

export interface FacetGroup {
  id: string;
  label: string;
  facets: Facet[];
}

/** A one-tap preset: the facets someone with this goal wants selected. */
export interface Track {
  id: string;
  label: string;
  facets: string[];
}

export const FACET_GROUPS: FacetGroup[] = taxonomy.groups;
export const TRACKS: Track[] = taxonomy.tracks;

/** The group whose facets are *required* (a topic must carry one of the selected roles). */
const ROLE_GROUP = 'role';

const ALL_FACETS: Facet[] = FACET_GROUPS.flatMap((group) => group.facets);

export function isFacetId(value: string): boolean {
  return ALL_FACETS.some((facet) => facet.id === value);
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

/**
 * Which topics to show for a selection.
 *
 * - Role (Frontend, Backend, SRE…) is strict: a topic must carry one of the
 *   selected roles. Several roles widen the result (Full-stack = Frontend + Backend).
 * - Language, framework and platform *narrow only what is specific*. A topic that
 *   carries no tag in that group is general (Accessibility, System design) and
 *   always stays, so "Frontend + React" shows the React topics *and* the general
 *   frontend ones, but hides the Angular-only ones. Several picks in one group widen.
 */
export function filterSections<T extends SectionMeta>(sections: readonly T[], selected: readonly string[]): T[] {
  if (selected.length === 0) return [...sections];
  const picked = FACET_GROUPS.map((group) => ({
    group,
    ids: group.facets.filter((f) => selected.includes(f.id)).map((f) => f.id),
  })).filter(({ ids }) => ids.length > 0);
  return sections.filter((section) =>
    picked.every(({ group, ids }) => {
      if (ids.some((id) => section.facets.includes(id))) return true;
      if (group.id === ROLE_GROUP) return false;
      return !group.facets.some((f) => section.facets.includes(f.id));
    }),
  );
}

/** A track is offered once every facet it needs has content; otherwise it's "Coming soon". */
export function trackAvailable(track: Track, counts: ReadonlyMap<string, number>): boolean {
  return track.facets.every((id) => (counts.get(id) ?? 0) > 0);
}

/** The track whose facets equal the selection exactly (order-insensitive), if any. */
export function matchingTrack(selected: readonly string[]): Track | undefined {
  if (selected.length === 0) return undefined;
  return TRACKS.find((track) => track.facets.length === selected.length && track.facets.every((id) => selected.includes(id)));
}

/** "Frontend · React" style summary of a selection, for headings and empty states. */
export function describeSelection(selected: readonly string[]): string {
  return matchingTrack(selected)?.label ?? selected.map(facetLabel).join(' · ');
}
