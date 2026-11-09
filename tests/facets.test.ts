import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeSelection, facetCounts, FACET_GROUPS, filterSections, focusChips, isFacetId, normalizeSelection } from '../src/content/facets.ts';
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
  it('only names known roles on focus chips', () => {
    const roles = new Set(FACET_GROUPS.find((g) => g.id === 'role')!.facets.map((f) => f.id));
    for (const g of FACET_GROUPS) for (const f of g.facets) for (const r of f.roles ?? []) assert.ok(roles.has(r), `${f.id}: ${r}`);
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
  it('focus chips widen: any selected chip keeps a topic', () => {
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'react'])), ['react', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'react', 'angular'])), ['react', 'angular', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['frontend', 'javascript', 'react'])), ['js', 'react', 'ts-react']);
    assert.deepEqual(ids(filterSections(sections, ['backend', 'go'])), ['go']);
  });
  it('counts topics per facet', () => {
    const counts = facetCounts(sections);
    assert.equal(counts.get('frontend'), 5);
    assert.equal(counts.get('go'), 1);
    assert.equal(counts.get('vue'), undefined);
  });
});

describe('focus chips', () => {
  it('are offered per role, with announced-but-empty ones marked coming soon', () => {
    assert.deepEqual(focusChips(sections, []), []);
    const chips = focusChips(sections, ['frontend']);
    const by = (id: string) => chips.find((c) => c.facet.id === id);
    assert.equal(by('react')?.count, 2);
    assert.equal(by('react')?.soon, false);
    assert.equal(by('vue')?.soon, true); // Vue is announced for Frontend but has no topic yet
    assert.equal(by('go'), undefined); // a backend chip is not offered under Frontend
  });
  it('are dropped from a selection when the role changes', () => {
    assert.deepEqual(normalizeSelection(sections, ['frontend', 'react', 'go']), ['frontend', 'react']);
    assert.deepEqual(normalizeSelection(sections, ['backend', 'react']), ['backend']);
    assert.deepEqual(normalizeSelection(sections, ['react']), []);
  });
  it('are described with the role first', () => {
    assert.equal(describeSelection(['frontend', 'react', 'performance']), 'Frontend · React, Performance');
    assert.equal(describeSelection(['frontend', 'backend']), 'Frontend + Backend');
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
    // Roles that offer focus chips need every topic reachable from some chip.
    const roleCount = (role: string) => shipped.filter((x) => x.facets.includes(role)).length;
    for (const section of shipped) {
      const hasRoleWithChips = section.facets.some((f) => roleCount(f) > 1 && ['frontend', 'backend'].includes(f));
      const onlyRoles = section.facets.every((f) => ['frontend', 'backend', 'sre', 'qe', 'cloud', 'design', 'data', 'aiml', 'fde'].includes(f));
      assert.ok(!(hasRoleWithChips && onlyRoles), `${section.id} has no focus area, so a chip selection would hide it`);
    }
  });
});
