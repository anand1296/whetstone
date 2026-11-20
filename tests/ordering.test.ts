import assert from 'node:assert/strict';
import test from 'node:test';
import { orderByLevel } from '../src/content/ordering.ts';
import type { Level, QuestionMeta, SectionMeta } from '../src/content/types.ts';

function q(id: string, level: Level): QuestionMeta {
  return { id, sectionId: 's', title: id, level, tags: [], minutes: 5, summary: '', searchText: '' } as QuestionMeta;
}
const section = (questions: QuestionMeta[]): SectionMeta =>
  ({ id: 's', title: 'S', description: '', facets: [], questions }) as SectionMeta;

test('orders easiest first and keeps authoring order within a level', () => {
  const [out] = orderByLevel([section([q('a', 'senior'), q('b', 'lead'), q('c', 'junior'), q('d', 'senior'), q('e', 'junior'), q('f', 'principal')])]);
  assert.deepEqual(out?.questions.map((x) => x.id), ['c', 'e', 'a', 'd', 'b', 'f']);
});

test('does not mutate its input and reuses sections that are already ordered', () => {
  const ordered = section([q('a', 'junior'), q('b', 'senior')]);
  const mixed = section([q('x', 'senior'), q('y', 'junior')]);
  const [same, changed] = orderByLevel([ordered, mixed]);
  assert.equal(same, ordered);
  assert.deepEqual(mixed.questions.map((x) => x.id), ['x', 'y']);
  assert.deepEqual(changed?.questions.map((x) => x.id), ['y', 'x']);
});
