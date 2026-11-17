import { z } from 'zod';

export const eventSchema = z.object({
  id: z.string().uuid(), day: z.number().int().positive(), lessonId: z.string().min(1),
  type: z.enum(['read', 'quiz', 'favorite']), word: z.string().min(1).optional(),
  favorite: z.boolean().optional(), answers: z.array(z.number().int().min(0).max(3)).max(10).optional(),
}).strict();
export const studyEventSchema = eventSchema.extend({
  createdAt: z.string().datetime(), score: z.number().int().min(0).max(10).optional(),
}).strict();
export const studyEventsSchema = z.array(studyEventSchema).max(100000);
