import type { DailyBatch } from './daily-types';
import type { StudyEvent } from './study-types';

export function latestQuiz(all: StudyEvent[], day: number, lessonId: string) {
  for (let index = all.length - 1; index >= 0; index--) {
    const event = all[index];
    if (event.day === day && event.lessonId === lessonId && event.type === 'quiz') return event;
  }
  return undefined;
}

export function completed(batch: DailyBatch, all: StudyEvent[]) {
  return batch.content.lessons.every(lesson =>
    all.some(event => event.day === batch.day && event.lessonId === lesson.id && event.type === 'read') &&
    Boolean(latestQuiz(all, batch.day, lesson.id)));
}

export function favorites(all: StudyEvent[]) {
  const current = new Map<string, StudyEvent>();
  for (const event of all) {
    if (event.type !== 'favorite' || !event.word) continue;
    const key = `${event.day}:${event.word}`;
    if (event.favorite) current.set(key, event);
    else current.delete(key);
  }
  return [...current.values()];
}
