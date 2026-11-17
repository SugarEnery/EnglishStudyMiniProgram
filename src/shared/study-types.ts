export type EventInput = {
  id: string;
  day: number;
  lessonId: string;
  type: 'read' | 'quiz' | 'favorite';
  word?: string;
  favorite?: boolean;
  answers?: number[];
};
export type StudyEvent = EventInput & { createdAt: string; score?: number };
export type DaySummary = { day: number; date: string; words: number; targetWords?:string[] };
export type SessionResponse = { token: string; expiresAt: string };
export type EventsResponse = { events: StudyEvent[] };
export type SaveEventResponse = { event: StudyEvent };
