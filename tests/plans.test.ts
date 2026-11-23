import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deletePlan,
  EMPTY_PROGRESS,
  livePlans,
  MAX_LIVE_PLANS,
  MAX_PLAN_ENTRIES,
  mergeProgress,
  parseProgress,
  PLAN_NAME_LIMIT,
  progressEquals,
  savePlan,
  setDone,
  toDocument,
  type ProgressState,
} from '../src/state/progress.ts';
import { effectiveFacets, pickActivePlan, planSections, planStats, suggestPlanName } from '../src/state/plans.ts';
import type { QuestionMeta, SectionMeta } from '../src/content/types.ts';

const T0 = 1_700_000_000_000;

const question = (id: string, sectionId: string, minutes = 10): QuestionMeta =>
  ({ id, sectionId, title: id, level: 'senior', minutes, tags: [] }) as unknown as QuestionMeta;
const topic = (id: string, facets: string[], questionIds: string[]): SectionMeta => ({
  id,
  title: id,
  description: '',
  facets,
  questions: questionIds.map((q) => question(q, id)),
});

const sections = [
  topic('js', ['frontend', 'javascript'], ['js1', 'js2']),
  topic('design', ['frontend', 'design'], ['d1']),
  topic('go', ['backend', 'go'], ['go1', 'go2', 'go3']),
  topic('k8s', ['backend', 'sre', 'cloud', 'kubernetes'], ['k1', 'k2']),
  topic('lld', ['backend', 'lld'], ['l1']),
];

describe('plans in the progress document', () => {
  it('creates, renames and deletes with a tombstone', () => {
    let s = savePlan(EMPTY_PROGRESS, { id: 'p1', name: '  Frontend   + Design ', facets: ['frontend', 'design', 'design'] }, T0);
    assert.deepEqual(livePlans(s).map((p) => [p.name, p.facets]), [['Frontend + Design', ['frontend', 'design']]]);
    assert.equal(s.plans.p1?.createdAt, T0);

    s = savePlan(s, { id: 'p1', name: 'Frontend', facets: ['frontend'] }, T0 + 5);
    assert.equal(s.plans.p1?.createdAt, T0, 'a rename keeps the creation time');
    assert.equal(s.plans.p1?.updatedAt, T0 + 5);

    const gone = deletePlan(s, 'p1', T0 + 9);
    assert.equal(livePlans(gone).length, 0);
    assert.equal(gone.plans.p1?.deleted, true);
    assert.equal(gone.plans.p1?.name, '');
    assert.deepEqual(gone.plans.p1?.facets, []);
    assert.equal(deletePlan(gone, 'p1', T0 + 10), gone, 'deleting twice changes nothing');
  });

  it('returns the same state when nothing changes or the plan is invalid', () => {
    const s = savePlan(EMPTY_PROGRESS, { id: 'p1', name: 'Go', facets: ['go'] }, T0);
    assert.equal(savePlan(s, { id: 'p1', name: 'Go', facets: ['go'] }, T0 + 1), s);
    assert.equal(savePlan(s, { id: 'p2', name: '   ', facets: [] }, T0 + 1), s);
    assert.equal(savePlan(s, { id: '', name: 'x', facets: [] }, T0 + 1), s);
  });

  it('clips long names and refuses plan number 13 (but allows re-saving and reviving)', () => {
    let s: ProgressState = EMPTY_PROGRESS;
    for (let i = 0; i < MAX_LIVE_PLANS; i++) s = savePlan(s, { id: `p${i}`, name: `Plan ${i}`, facets: [] }, T0 + i);
    assert.equal(livePlans(s).length, MAX_LIVE_PLANS);
    assert.equal(savePlan(s, { id: 'extra', name: 'One more', facets: [] }, T0 + 100), s);
    assert.notEqual(savePlan(s, { id: 'p0', name: 'Renamed', facets: [] }, T0 + 100), s);
    const long = savePlan(EMPTY_PROGRESS, { id: 'p', name: 'x'.repeat(PLAN_NAME_LIMIT + 40), facets: [] }, T0);
    assert.equal(long.plans.p?.name.length, PLAN_NAME_LIMIT);
  });

  it('prunes the oldest tombstones when the document fills up', () => {
    let s: ProgressState = EMPTY_PROGRESS;
    for (let i = 0; i < MAX_PLAN_ENTRIES; i++) {
      s = savePlan(s, { id: `p${i}`, name: 'x', facets: [] }, T0 + i);
      s = deletePlan(s, `p${i}`, T0 + i + 1000);
    }
    assert.equal(Object.keys(s.plans).length, MAX_PLAN_ENTRIES);
    s = savePlan(s, { id: 'fresh', name: 'Fresh', facets: [] }, T0 + 5000);
    assert.ok(Object.keys(s.plans).length <= MAX_PLAN_ENTRIES);
    assert.equal(s.plans.fresh?.deleted, false);
    assert.equal(s.plans.p0, undefined, 'the oldest tombstone went first');
  });

  it('merges per plan, last writer wins, and a newer delete beats an older edit', () => {
    const base = savePlan(EMPTY_PROGRESS, { id: 'p1', name: 'Go', facets: ['go'] }, T0);
    const renamedOnLaptop = savePlan(base, { id: 'p1', name: 'Go and K8s', facets: ['go', 'kubernetes'] }, T0 + 10);
    const deletedOnPhone = deletePlan(base, 'p1', T0 + 20);
    const addedOnPhone = savePlan(deletedOnPhone, { id: 'p2', name: 'Frontend', facets: ['frontend'] }, T0 + 21);

    const ab = mergeProgress(renamedOnLaptop, addedOnPhone);
    const ba = mergeProgress(addedOnPhone, renamedOnLaptop);
    assert.ok(progressEquals(ab, ba), 'merge is commutative');
    assert.ok(progressEquals(mergeProgress(ab, ab), ab), 'merge is idempotent');
    assert.deepEqual(livePlans(ab).map((p) => p.id), ['p2']);
    assert.equal(ab.plans.p1?.deleted, true);
  });

  it('merging does not touch question progress, and plans do not depend on it', () => {
    const withPlan = savePlan(EMPTY_PROGRESS, { id: 'p1', name: 'Go', facets: ['go'] }, T0);
    const withDone = setDone(EMPTY_PROGRESS, 'go1', true, T0 + 1);
    const both = mergeProgress(withPlan, withDone);
    assert.equal(both.questions.go1?.done, true);
    assert.equal(livePlans(both).length, 1);
  });

  it('survives a JSON round trip, and old documents without plans still parse', () => {
    const s = savePlan(savePlan(EMPTY_PROGRESS, { id: 'a', name: 'A', facets: ['go'] }, T0), { id: 'b', name: 'B', facets: [] }, T0 + 1);
    const back = parseProgress(JSON.parse(JSON.stringify(toDocument(deletePlan(s, 'b', T0 + 2)))));
    assert.ok(back);
    assert.deepEqual(livePlans(back).map((p) => p.id), ['a']);
    assert.equal(back.plans.b?.deleted, true);

    const old = parseProgress({ version: 1, questions: { q: { done: true, updatedAt: 1 } }, lastVisit: null });
    assert.deepEqual(old?.plans, {});
  });

  it('does not trust plans it reads', () => {
    const parsed = parseProgress({
      version: 1,
      questions: {},
      plans: {
        ok: { name: ' Good ', facets: ['go', 7, 'go', ''], createdAt: 5, updatedAt: 6 },
        gone: { name: 'ignored', facets: ['go'], updatedAt: 9, deleted: true },
        nameless: { name: '  ', facets: [], updatedAt: 1 },
        noClock: { name: 'x', facets: [] },
        junk: 'plan',
      },
    });
    assert.deepEqual(Object.keys(parsed?.plans ?? {}).sort(), ['gone', 'ok']);
    assert.deepEqual(parsed?.plans.ok?.facets, ['go']);
    assert.equal(parsed?.plans.ok?.name, 'Good');
    assert.equal(parsed?.plans.gone?.name, '');
    assert.deepEqual(parsed?.plans.gone?.facets, []);
  });
});

describe('resolving a plan against content', () => {
  const ids = (list: SectionMeta[]) => list.map((s) => s.id);

  it('turns a facet selection into topics', () => {
    assert.deepEqual(ids(planSections(sections, { facets: ['frontend', 'design'] })), ['js', 'design']);
    assert.deepEqual(ids(planSections(sections, { facets: ['backend', 'go', 'kubernetes'] })), ['go', 'k8s']);
    assert.deepEqual(ids(planSections(sections, { facets: [] })), ids(sections), 'no facets means everything');
  });

  it('ignores facets that no longer match any topic, instead of emptying the plan', () => {
    assert.deepEqual(effectiveFacets(sections, ['backend', 'angular']), ['backend']);
    assert.deepEqual(ids(planSections(sections, { facets: ['backend', 'angular'] })), ['go', 'k8s', 'lld']);
    assert.deepEqual(ids(planSections(sections, { facets: ['nonsense'] })), ids(sections));
  });

  it('picks up a topic published later', () => {
    const plan = { facets: ['backend', 'kubernetes'] };
    assert.deepEqual(ids(planSections(sections, plan)), ['k8s']);
    const later = [...sections, topic('k8s-ops', ['backend', 'kubernetes'], ['o1'])];
    assert.deepEqual(ids(planSections(later, plan)), ['k8s', 'k8s-ops']);
  });

  it('names a selection', () => {
    assert.equal(suggestPlanName([]), 'Everything');
    assert.equal(suggestPlanName(['frontend', 'design']), 'Frontend + Design');
    assert.equal(suggestPlanName(['backend', 'go', 'kubernetes']), 'Backend · Go, Kubernetes');
  });

  it('counts progress, due answers and time against the plan only', () => {
    let state: ProgressState = setDone(EMPTY_PROGRESS, 'go1', true, T0);
    state = setDone(state, 'js1', true, T0);
    const later = T0 + 3 * 86_400_000; // past the first (two day) review
    const go = planStats(sections, { facets: ['backend', 'go'] }, state.questions, later);
    assert.equal(go.sections.length, 1);
    assert.equal(go.questions.length, 3);
    assert.equal(go.done, 1, 'the frontend question does not count here');
    assert.equal(go.due, 1);
    assert.equal(go.minutes, 30);
    assert.equal(go.minutesLeft, 20);

    const everything = planStats(sections, { facets: [] }, state.questions, later);
    assert.equal(everything.questions.length, 9);
    assert.equal(everything.done, 2);
  });

  it('keeps the remembered active plan, else the oldest, else none', () => {
    let s = savePlan(EMPTY_PROGRESS, { id: 'a', name: 'A', facets: [] }, T0);
    s = savePlan(s, { id: 'b', name: 'B', facets: [] }, T0 + 1);
    assert.equal(pickActivePlan(s, 'b')?.id, 'b');
    assert.equal(pickActivePlan(s, 'missing')?.id, 'a');
    assert.equal(pickActivePlan(s, null)?.id, 'a');
    s = deletePlan(s, 'a', T0 + 2);
    assert.equal(pickActivePlan(s, 'a')?.id, 'b', 'a deleted plan is never active');
    assert.equal(pickActivePlan(deletePlan(s, 'b', T0 + 3), 'b'), null);
  });
});
