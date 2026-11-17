import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { completed, favorites, latestQuiz } from '../src/shared/progress';
import type { StudyEvent } from '../src/shared/study-types';
import type { DailyBatch } from '../src/shared/daily-types';
import { studyEventsSchema } from '../src/shared/study-schema';

const event = (overrides: Partial<StudyEvent> = {}): StudyEvent => ({ id: randomUUID(), day: 1, lessonId: 'oxford-1-1', type: 'read', createdAt: '2026-10-20T00:00:00.000Z', ...overrides });
const batch = { day: 1, content: { lessons: [{ id: 'oxford-1-1' }, { id: 'oxford-1-2' }] } } as DailyBatch;

test('完成状态需要本日每个情境阅读与测验，错误答案仍算完成', () => {
  const records = [event(), event({ type: 'quiz', answers: [0], score: 0 }), event({ lessonId: 'oxford-1-2' })];
  assert.equal(completed(batch, records), false);
  assert.equal(completed(batch, [...records, event({ day: 2, lessonId: 'oxford-1-2', type: 'quiz' })]), false);
  assert.equal(completed(batch, [...records, event({ lessonId: 'oxford-1-2', type: 'quiz', score: 0 })]), true);
});
test('恢复最近测验严格按学习日及情境隔离', () => {
  const first = event({ type: 'quiz', answers: [1] });
  const last = event({ type: 'quiz', answers: [2] });
  const unrelated = event({ day: 2, type: 'quiz', answers: [3] });
  assert.equal(latestQuiz([first, last, unrelated], 1, 'oxford-1-1')?.id, last.id);
  assert.equal(latestQuiz([first], 1, 'oxford-1-2'), undefined);
});
test('同一词跨情境撤销收藏，不影响另一学习日', () => {
  const saved = event({ type: 'favorite', word: 'water', favorite: true });
  const nextDay = event({ day: 2, lessonId: 'oxford-2-1', type: 'favorite', word: 'water', favorite: true });
  const canceled = event({ lessonId: 'oxford-1-2', type: 'favorite', word: 'water', favorite: false });
  assert.deepEqual(favorites([saved, nextDay, canceled]).map(e => e.id), [nextDay.id]);
  const restored = event({ type: 'favorite', word: 'water', favorite: true });
  assert.deepEqual(favorites([saved, canceled, restored]).map(e => e.id), [restored.id]);
});
test('持久记录格式损坏直接拒绝，合法记录可读', () => {
  assert.equal(studyEventsSchema.parse([event()]).length, 1);
  assert.throws(() => studyEventsSchema.parse([null]));
  assert.throws(() => studyEventsSchema.parse([event({ createdAt: 'yesterday' })]));
  assert.throws(() => studyEventsSchema.parse([{ ...event(), userId: 'other' }]));
});
