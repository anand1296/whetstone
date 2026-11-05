/**
 * The filter-chip taxonomy. The list itself lives in content/topics.json so the
 * browser, the content compiler and the Go backend all read one source.
 *
 * A chip is *selectable* only while at least one published round carries its
 * topic (see availableTopics); the rest render disabled with a "Coming soon"
 * tooltip. Adding a round tagged `angular` therefore lights up the Angular chip
 * with no UI change.
 */
import taxonomy from '../../content/topics.json' with { type: 'json' };
import type { SectionMeta } from './types.ts';

export interface Topic {
  id: string;
  label: string;
}

export interface TopicGroup {
  id: string;
  label: string;
  topics: Topic[];
}

export const TOPIC_GROUPS: TopicGroup[] = taxonomy.groups;

const ALL_TOPICS: Topic[] = TOPIC_GROUPS.flatMap((group) => group.topics);

export function isTopicId(value: string): boolean {
  return ALL_TOPICS.some((topic) => topic.id === value);
}

export function topicLabel(id: string): string {
  return ALL_TOPICS.find((topic) => topic.id === id)?.label ?? id;
}

/** Topic id -> number of rounds that carry it. */
export function topicCounts(sections: readonly SectionMeta[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const section of sections) {
    for (const topic of section.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return counts;
}

/**
 * Filtering rule: a round matches when, for every group that has a selection,
 * it carries at least one of that group's selected topics. So Frontend + React
 * + TypeScript means "frontend AND (react) AND (typescript)", while two
 * languages widen within their own row.
 */
export function filterSections<T extends SectionMeta>(sections: readonly T[], selected: readonly string[]): T[] {
  if (selected.length === 0) return [...sections];
  const picked = TOPIC_GROUPS.map((group) => group.topics.filter((t) => selected.includes(t.id)).map((t) => t.id)).filter(
    (ids) => ids.length > 0,
  );
  return sections.filter((section) => picked.every((ids) => ids.some((id) => section.topics.includes(id))));
}
