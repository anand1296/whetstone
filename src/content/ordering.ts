import { LEVELS, type SectionMeta } from './types.ts';

const RANK = new Map<string, number>(LEVELS.map((level, index) => [level, index]));

/**
 * Learner-facing order inside a topic: easiest level first, authoring order kept within a level.
 *
 * Content is written in the order ideas arrive, so newer junior questions end up at the bottom of a topic.
 * Readers expect to start gently, and "Start here" and "Up next" follow the same order. The admin console
 * works on stored positions and is unaffected; moving a question up or down reorders it within its level.
 */
export function orderByLevel(sections: readonly SectionMeta[]): SectionMeta[] {
  return sections.map((section) => {
    const ordered = section.questions
      .map((question, index) => ({ question, index }))
      .sort((a, b) => (RANK.get(a.question.level) ?? 0) - (RANK.get(b.question.level) ?? 0) || a.index - b.index)
      .map(({ question }) => question);
    const unchanged = ordered.every((question, index) => question === section.questions[index]);
    return unchanged ? section : { ...section, questions: ordered };
  });
}
