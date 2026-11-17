import {courseCatalog} from './course-catalog';
import type {DaySummary,StudyEvent} from './study-types';

export const LESSONS_PER_DAY=6;
export function dayProgress(day:number,events:StudyEvent[]){
 const ids=new Set(courseCatalog.find(course=>course.day===day)?.content.lessons.map(lesson=>lesson.id)??[]);
 const read=new Set(events.filter(e=>e.day===day&&ids.has(e.lessonId)&&e.type==='read').map(e=>e.lessonId));
 const quiz=new Set(events.filter(e=>e.day===day&&ids.has(e.lessonId)&&e.type==='quiz').map(e=>e.lessonId));
 const finished=[...read].filter(id=>quiz.has(id)).length;
 return {read:read.size,quiz:quiz.size,finished,complete:finished===LESSONS_PER_DAY};
}
export function studyOverview(days:DaySummary[],events:StudyEvent[]){
 const done=days.filter(day=>dayProgress(day.day,events).complete);
 const published=new Set(days.map(day=>day.day));
 return {completedDays:done.length,completedWords:done.reduce((n,day)=>n+day.words,0),readLessons:new Set(events.filter(e=>published.has(e.day)&&courseCatalog.some(course=>course.day===e.day&&course.content.lessons.some(lesson=>lesson.id===e.lessonId))&&e.type==='read').map(e=>`${e.day}:${e.lessonId}`)).size};
}
