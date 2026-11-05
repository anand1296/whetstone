import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeSelection, facetCounts, FACET_GROUPS, filterSections, isFacetId, matchingTrack, trackAvailable, TRACKS } from '../src/content/facets.ts';
import { compileContent, readContentDir, type SourceFile } from '../build/content/compile.ts';
import { ContentError } from '../build/content/frontmatter.ts';
import type { SectionMeta } from '../src/content/types.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const topic = (id: string, facets: string[]): SectionMeta => ({ id, title: id, description: '', facets, questions: [] });
const sections = [
  topic('a11y', ['frontend']),
  topic('js', ['frontend', 'javascript']),
  topic('react', ['frontend', 'react']),
  topic('angular', ['frontend', 'angular']),
  topic('ts-react', ['frontend', 'javascript', 'typescript', 'react']),
  topic('go', ['backend', 'go']),
  topic('sre-basics', ['sre']),
];
const ids = (list: SectionMeta[]) => list.map((s) => s.id);

describe('facet taxonomy', () => {
  it('has unique ids', () => {
    const all = FACET_GROUPS.flatMap((g) => g.facets.map((f) => f.id));
    assert.equal(new Set(all).size, all.length);
    assert.ok(isFacetId('react') && isFacetId('design') && !isFacetId('nope') && !isFacetId(''));
  });
  it('only uses known facets in tracks', () => {
    for (const track of TRACKS) for (const id of track.facets) assert.ok(isFacetId(id), `${track.id}: ${id}`);
  });
});

describe('filterSections', () => {
  it('shows everything when nothing is selected', () => {
    assert.equal(filterSections(sections, []).length, sections.length);
  });
  it('role is strict and widens across roles', () => {
    assert.deepEqual(ids(filterSections(sections, ['backend'])), ['go']);
    assert.deepEqual(ids(filterSections(sections, ['sre'])), ['sre-basics']);
    assert.deepEqual(ids(filterSections(sections, ['backend', 'sre'])), ['go', 'sre-basics']);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'backend'])), ['a11y', 'js', 'react', 'angular', 'ts-react', 'go']);
  });
  it('a framework keeps the general topics and drops other frameworks', () => {
    // A React-only engineer still needs Accessibility and JavaScript; Angular-only is hidden.
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'react'])), ['a11y', 'js', 'react', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'angular'])), ['a11y', 'js', 'angular']);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'react', 'angular'])), ['a11y', 'js', 'react', 'angular', 'ts-react']);
  });
  it('a language keeps the general topics too', () => {
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'typescript'])), ['a11y', 'react', 'angular', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['backend', 'go'])), ['go']);
  });
  it('counts topics per facet', () => {
    const counts = facetCounts(sections);
    assert.equal(counts.get('frontend'), 5);
    assert.equal(counts.get('go'), 1);
    assert.equal(counts.get('vue'), undefined);
  });
});

describe('tracks', () => {
  const counts = facetCounts(sections);
  it('are available only when every facet has content', () => {
    const by = (id: string) => TRACKS.find((t) => t.id === id)!;
    assert.ok(trackAvailable(by('frontend'), counts));
    assert.ok(trackAvailable(by('frontend-react'), counts));
    assert.ok(trackAvailable(by('fullstack'), counts));
    assert.ok(!trackAvailable(by('frontend-vue'), counts));
    assert.ok(!trackAvailable(by('qe'), counts));
  });
  it('are matched by an exact selection, in any order', () => {
    assert.equal(matchingTrack(['react', 'frontend'])?.id, 'frontend-react');
    assert.equal(matchingTrack(['frontend', 'react', 'typescript']), undefined);
    assert.equal(matchingTrack([]), undefined);
    assert.equal(describeSelection(['frontend', 'react', 'typescript']), 'Frontend · React · TypeScript');
  });
});

describe('topic facets in content files', () => {
  const file = (facets: string): SourceFile => ({
    path: 'content/x.md',
    source: `---\nid: x\ntitle: X\ndescription: d\n${facets}---\n\n## Q\n<!--\nid: q\nlevel: senior\ntags: a\nminutes: 5\n-->\n\n> [!TLDR]\n> Short.\n\n${'Body text that is long enough. '.repeat(10)}`,
  });
  it('parses, lower-cases and de-duplicates', () => {
    const [section] = compileContent([file('facets: Frontend, react, frontend\n')]).sections;
    assert.deepEqual(section?.facets, ['frontend', 'react']);
  });
  it('rejects unknown facets with the file name', () => {
    assert.throws(() => compileContent([file('facets: frontend, nope\n')]), (e: unknown) => e instanceof ContentError && /unknown facet "nope"/.test(e.message));
  });
  it('tags every shipped round, and every topic id exists', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const { sections: shipped } = compileContent(readContentDir(join(root, 'content')));
    for (const section of shipped) assert.ok(section.facets.length > 0, `${section.id} has no facets`);
  });
});
