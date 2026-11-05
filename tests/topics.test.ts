import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterSections, isTopicId, topicCounts, TOPIC_GROUPS } from '../src/content/topics.ts';
import { compileContent, readContentDir, type SourceFile } from '../build/content/compile.ts';
import { ContentError } from '../build/content/frontmatter.ts';
import type { SectionMeta } from '../src/content/types.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const round = (id: string, topics: string[]): SectionMeta => ({ id, title: id, description: '', topics, questions: [] });
const sections = [
  round('js', ['frontend', 'javascript']),
  round('react', ['frontend', 'react']),
  round('ts-react', ['frontend', 'javascript', 'typescript', 'react']),
  round('go', ['backend', 'go']),
];
const ids = (list: SectionMeta[]) => list.map((s) => s.id);

describe('topic taxonomy', () => {
  it('has unique ids and labels', () => {
    const all = TOPIC_GROUPS.flatMap((g) => g.topics.map((t) => t.id));
    assert.equal(new Set(all).size, all.length);
    assert.ok(isTopicId('react') && !isTopicId('nope') && !isTopicId(''));
  });
});

describe('filterSections', () => {
  it('shows everything when nothing is selected', () => {
    assert.deepEqual(ids(filterSections(sections, [])), ['js', 'react', 'ts-react', 'go']);
  });
  it('widens within a group and narrows across groups', () => {
    assert.deepEqual(ids(filterSections(sections, ['react', 'vue'])), ['react', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['react', 'go'])), []);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'typescript'])), ['ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['javascript', 'typescript'])), ['js', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['backend', 'go'])), ['go']);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'go'])), []);
  });
  it('counts rounds per topic', () => {
    const counts = topicCounts(sections);
    assert.equal(counts.get('frontend'), 3);
    assert.equal(counts.get('go'), 1);
    assert.equal(counts.get('angular'), undefined);
  });
});

describe('round topics in content files', () => {
  const file = (topics: string): SourceFile => ({
    path: 'content/x.md',
    source: `---\nid: x\ntitle: X\ndescription: d\n${topics}---\n\n## Q\n<!--\nid: q\nlevel: senior\ntags: a\nminutes: 5\n-->\n\n> [!TLDR]\n> Short.\n\n${'Body text that is long enough. '.repeat(10)}`,
  });
  it('parses, lower-cases and de-duplicates', () => {
    const [section] = compileContent([file('topics: Frontend, react, frontend\n')]).sections;
    assert.deepEqual(section?.topics, ['frontend', 'react']);
  });
  it('rejects unknown topics with the file name', () => {
    assert.throws(() => compileContent([file('topics: frontend, nope\n')]), (e: unknown) => e instanceof ContentError && /unknown topic "nope"/.test(e.message));
  });
  it('tags every shipped round, and every topic id exists', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const { sections: shipped } = compileContent(readContentDir(join(root, 'content')));
    for (const section of shipped) assert.ok(section.topics.length > 0, `${section.id} has no topics`);
  });
});
