import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PROGRESS,
  isDue,
  mergeProgress,
  parseProgress,
  progressEquals,
  recordReview,
  recordVisit,
  setDone,
  setNotes,
  NOTES_LIMIT,
} from '../src/state/progress.ts';
import { DAY_MS, intervalDays, previewDays, REVIEW_GRADES, REVIEW_INTERVAL_DAYS, stageAfter } from '../src/lib/srs.ts';

const T0 = 1_700_000_000_000;

describe('progress model', () => {
  it('marks done and schedules the first review', () => {
    const s = setDone(EMPTY_PROGRESS, 'q1', true, T0);
    assert.equal(s.questions.q1?.done, true);
    assert.equal(s.questions.q1?.dueAt, T0 + (REVIEW_INTERVAL_DAYS[0] ?? 0) * DAY_MS);
    assert.equal(s.questions.q1?.updatedAt, T0);
  });

  it('returns the same object when nothing changes', () => {
    const s = setDone(EMPTY_PROGRESS, 'q1', true, T0);
    assert.equal(setDone(s, 'q1', true, T0 + 1), s);
    assert.equal(setNotes(s, 'q1', '', T0 + 1), s);
    const visited = recordVisit(s, 'sec', 'q1', T0);
    assert.equal(recordVisit(visited, 'sec', 'q1', T0 + 5), visited);
  });

  it('grades a review like Anki: again resets, hard repeats, good advances, easy skips a rung', () => {
    const done = setDone(EMPTY_PROGRESS, 'q1', true, T0);
    const at = T0 + 3 * DAY_MS;

    const good = recordReview(done, 'q1', 'good', at);
    assert.equal(good.questions.q1?.stage, 1);
    assert.equal(good.questions.q1?.dueAt, at + intervalDays(1) * DAY_MS);

    const hard = recordReview(good, 'q1', 'hard', at);
    assert.equal(hard.questions.q1?.stage, 1);
    assert.equal(hard.questions.q1?.dueAt, at + intervalDays(1) * DAY_MS);

    const easy = recordReview(done, 'q1', 'easy', at);
    assert.equal(easy.questions.q1?.stage, 2);
    assert.equal(easy.questions.q1?.dueAt, at + intervalDays(2) * DAY_MS);

    const again = recordReview(good, 'q1', 'again', T0 + 9 * DAY_MS);
    assert.equal(again.questions.q1?.done, false);
    assert.equal(again.questions.q1?.dueAt, null);
    assert.equal(again.questions.q1?.stage, 0);
  });

  it('ignores a review of something that is not marked done', () => {
    assert.equal(recordReview(EMPTY_PROGRESS, 'q1', 'good', T0), EMPTY_PROGRESS);
  });

  it('previews the next gap for each grade and never climbs past the ladder', () => {
    assert.deepEqual(
      REVIEW_GRADES.map((grade) => previewDays(0, grade)),
      [null, intervalDays(0), intervalDays(1), intervalDays(2)],
    );
    const top = REVIEW_INTERVAL_DAYS.length - 1;
    assert.equal(stageAfter(top, 'easy'), top);
    assert.equal(stageAfter(top, 'good'), top);
    assert.equal(previewDays(top, 'easy'), REVIEW_INTERVAL_DAYS[top]);
    assert.equal(stageAfter(-3, 'good'), 1);
  });

  it('caps the ladder at the last interval', () => {
    assert.equal(intervalDays(99), REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1]);
  });

  it('knows when an answer is due', () => {
    const s = setDone(EMPTY_PROGRESS, 'q1', true, T0);
    assert.equal(isDue(s.questions.q1, T0 + DAY_MS), false);
    assert.equal(isDue(s.questions.q1, T0 + 10 * DAY_MS), true);
  });

  it('clips notes to the limit', () => {
    const s = setNotes(EMPTY_PROGRESS, 'q1', 'x'.repeat(NOTES_LIMIT + 50), T0);
    assert.equal(s.questions.q1?.notes.length, NOTES_LIMIT);
  });
});

describe('mergeProgress (last-writer-wins per question)', () => {
  it('keeps the newest entry for each question and the newest visit', () => {
    const a = recordVisit(setDone(EMPTY_PROGRESS, 'q1', true, T0), 's1', 'q1', T0);
    const bBase = setDone(setDone(EMPTY_PROGRESS, 'q1', true, T0 + 8), 'q1', false, T0 + 10);
    const b = recordVisit(setDone(bBase, 'q2', true, T0 + 5), 's2', 'q2', T0 + 20);
    const merged = mergeProgress(a, b);
    assert.equal(merged.questions.q1?.done, false); // b's q1 is newer
    assert.equal(merged.questions.q2?.done, true);
    assert.equal(merged.lastVisit?.sectionId, 's2');
  });

  it('is commutative for different timestamps and idempotent', () => {
    const a = setDone(EMPTY_PROGRESS, 'q1', true, T0);
    const b = setDone(setDone(setDone(EMPTY_PROGRESS, 'q2', true, T0 + 1), 'q1', true, T0 + 2), 'q1', false, T0 + 3);
    assert.ok(progressEquals(mergeProgress(a, b), mergeProgress(b, a)));
    const once = mergeProgress(a, b);
    assert.ok(progressEquals(mergeProgress(once, b), once));
  });
});

describe('parseProgress', () => {
  it('rejects non-progress input', () => {
    assert.equal(parseProgress(null), null);
    assert.equal(parseProgress({ version: 2, questions: {} }), null);
    assert.equal(parseProgress('nope'), null);
  });

  it('drops invalid entries instead of trusting them', () => {
    const parsed = parseProgress({
      version: 1,
      questions: { ok: { done: true, updatedAt: 5, notes: 'hi' }, bad: { done: 'yes' } },
      lastVisit: { sectionId: 's', questionId: 7, at: 9 },
    });
    assert.deepEqual(Object.keys(parsed?.questions ?? {}), ['ok']);
    assert.equal(parsed?.questions.ok?.stage, 0);
    assert.equal(parsed?.lastVisit?.questionId, null);
  });

  it('round-trips through JSON', () => {
    const s = recordVisit(setNotes(setDone(EMPTY_PROGRESS, 'q1', true, T0), 'q1', 'my words', T0 + 1), 'sec', 'q1', T0 + 2);
    const back = parseProgress(JSON.parse(JSON.stringify(s)));
    assert.ok(back && progressEquals(back, s));
  });
});
