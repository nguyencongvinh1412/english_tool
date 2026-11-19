import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { closeDb, db, runMigrations } from '../db/client.js';
import { gateAttempts, ieltsPaths, pathLessons } from '../db/schema.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb } from '../test/helpers.js';
import { applyOrder, ensureFoundation, FOUNDATION_GRAMMAR, FOUNDATION_LESSONS, needsFoundation, planInserts, trimmedSteps } from './foundation.js';
import { LESSONS, phaseSteps } from './syllabus.js';

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('needsFoundation', () => {
  it('is for a learner who started after phase 1 with Writing or Speaking at 4.5 or less', () => {
    expect(needsFoundation(2, { listening: 5, reading: 6.5, writing: 4.5, speaking: 4 })).toBe(true);
    expect(needsFoundation(2, { listening: 5, reading: 6.5, writing: 5, speaking: 4.5 })).toBe(true);
  });
  it('is not for phase 1, a stronger writer and speaker, or an unmeasured Gate 0', () => {
    expect(needsFoundation(1, { writing: 4, speaking: 4 })).toBe(false);
    expect(needsFoundation(3, { writing: 5, speaking: 5 })).toBe(false);
    expect(needsFoundation(2, { writing: null, speaking: null })).toBe(false);
    expect(needsFoundation(2, null)).toBe(false);
    expect(needsFoundation(null, { writing: 4, speaking: 4 })).toBe(false);
  });
  it('only names grammar points and lessons that exist', () => {
    const points = new Set(GRAMMAR_POINTS.map((p) => p.id));
    for (const id of FOUNDATION_GRAMMAR) expect(points.has(id), id).toBe(true);
    const lessons = new Set(LESSONS.map((l) => l.id));
    for (const ids of Object.values(FOUNDATION_LESSONS)) for (const id of ids ?? []) expect(lessons.has(id), id).toBe(true);
  });
});

/** The stored rows of phase 2, the first `done` of them finished */
const storedPhase2 = (done: number, without: string[] = []) => {
  const steps = phaseSteps(2).filter((s) => !(s.kind === 'lesson' && without.includes((s.ref as { lessonId: string }).lessonId)));
  return steps.map((s, i) => ({ id: `r${i}`, seq: i, phase: s.phase, week: s.week, studyDay: s.day, block: s.block, kind: s.kind, status: i < done ? 'done' : 'todo', ref: s.ref as object, plannedDay: '2026-11-12' }));
};

describe('planInserts', () => {
  it('adds nothing to a complete queue when the pack does not apply', () => {
    expect(planInserts(storedPhase2(0), { foundation: false, practised: new Set() })).toEqual([]);
  });

  it('puts a lesson the syllabus gained in front of the next practice of its skill', () => {
    const rows = storedPhase2(10, ['ip-w-task1-check']);
    const [insert, ...rest] = planInserts(rows, { foundation: false, practised: new Set() });
    expect(rest).toEqual([]);
    expect(insert.step.ref).toEqual({ lessonId: 'ip-w-task1-check' });
    expect(insert.position).toBe('before');
    const anchor = rows.find((r) => r.id === insert.anchorId)!;
    expect(anchor.kind).toBe('practice');
    expect(anchor.block).toBe('writing');
    expect(anchor.status).toBe('todo');
  });

  it('brings the foundation pack: one grammar step on each day to come, the Writing and Speaking lessons before practices', () => {
    const rows = storedPhase2(8);
    const inserts = planInserts(rows, { foundation: true, practised: new Set() });
    const grammar = inserts.filter((i) => i.step.kind === 'grammar');
    expect(grammar.map((i) => (i.step.ref as { pointId: string }).pointId)).toEqual([...FOUNDATION_GRAMMAR]);
    for (const insert of grammar) {
      const host = rows.find((r) => r.id === insert.anchorId)!;
      expect(host.status).toBe('todo');
      expect(host.kind).toBe('grammar');
      expect(insert.position).toBe('after');
      expect(insert.step.studyDay).toBe(host.studyDay);
    }
    expect(new Set(grammar.map((i) => i.anchorId)).size).toBe(grammar.length);
    const lessons = inserts.filter((i) => i.step.kind === 'lesson').map((i) => (i.step.ref as { lessonId: string }).lessonId);
    expect(lessons.sort()).toEqual([...(FOUNDATION_LESSONS.writing ?? []), ...(FOUNDATION_LESSONS.speaking ?? [])].sort());
    // Every lesson has its own practice to stand in front of
    const anchors = inserts.filter((i) => i.step.kind === 'lesson').map((i) => i.anchorId);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('skips grammar already practised and stops once the pack is in the queue', () => {
    const rows = storedPhase2(0);
    const practised = new Set(['zero-article', 'present-simple']);
    const first = planInserts(rows, { foundation: true, practised });
    const points = first.filter((i) => i.step.kind === 'grammar').map((i) => (i.step.ref as { pointId: string }).pointId);
    expect(points).not.toContain('zero-article');
    expect(points).not.toContain('present-simple');
    const next = applyOrder(rows, first).map((entry, seq) =>
      'anchorId' in entry ? { id: `n${seq}`, seq, phase: entry.step.phase, week: entry.step.week, studyDay: entry.step.studyDay, block: entry.step.block, kind: entry.step.kind, status: 'todo', ref: entry.step.ref, plannedDay: entry.step.plannedDay } : { ...entry, seq }
    );
    expect(planInserts(next, { foundation: true, practised })).toEqual([]);
  });

  it('puts nothing in the past of the queue when few days are left', () => {
    // Only the last day of week 8 still has a grammar step
    const rows = storedPhase2(0).map((r, i, all) => ({ ...r, status: i < all.length - 12 ? 'done' : 'todo' }));
    const grammar = planInserts(rows, { foundation: true, practised: new Set() }).filter((i) => i.step.kind === 'grammar');
    const hosts = rows.filter((r) => r.kind === 'grammar' && r.status === 'todo');
    expect(grammar.length).toBeLessThanOrEqual(hosts.length);
    for (const insert of grammar) expect(rows.find((r) => r.id === insert.anchorId)!.status).toBe('todo');
  });
});

describe('trimmedSteps', () => {
  const rows = (phase: number) => phaseSteps(phase).map((s, i) => ({ id: `p${phase}-${i}`, seq: i, phase: s.phase, week: s.week, studyDay: s.day, block: s.block, kind: s.kind, status: 'todo', ref: s.ref as object, plannedDay: '2026-11-12' }));
  const strongReader = { listening: 5, reading: 6.5, writing: 4.5, speaking: 4 };

  it('drops the Reading practice of study days 3, 5 and 7 in phases 2 and 3, and nothing else', () => {
    for (const phase of [2, 3]) {
      const all = rows(phase);
      const dropped = trimmedSteps(all, strongReader).map((id) => all.find((r) => r.id === id)!);
      expect(dropped.length).toBeGreaterThan(0);
      for (const r of dropped) {
        expect(r.block).toBe('reading');
        expect(r.kind).toBe('practice');
        expect([3, 5, 7]).toContain(r.studyDay);
      }
      // Half of the Reading practice goes, the lessons and every other skill stay
      const reading = all.filter((r) => r.block === 'reading' && r.kind === 'practice');
      expect(dropped.length / reading.length).toBeCloseTo(0.5, 1);
    }
  });

  it('leaves a skill that is not a whole band above the gate, other phases, and steps already started', () => {
    expect(trimmedSteps(rows(2), { listening: 5, reading: 5.5, writing: 4.5, speaking: 4 })).toEqual([]);
    expect(trimmedSteps(rows(2), null)).toEqual([]);
    expect(trimmedSteps(rows(4), strongReader)).toEqual([]);
    const started = rows(2).map((r) => (r.block === 'reading' && r.kind === 'practice' ? { ...r, ref: { ...r.ref, sessionId: 's' } } : r));
    expect(trimmedSteps(started, strongReader)).toEqual([]);
    expect(trimmedSteps(rows(2).map((r) => ({ ...r, status: 'done' })), strongReader)).toEqual([]);
  });

  it('measures the gate that closes the phase: Reading 6.5 is a whole band above Gate 3 (5.5), 6.0 is not', () => {
    expect(trimmedSteps(rows(3), { reading: 6.5 }).length).toBeGreaterThan(0);
    expect(trimmedSteps(rows(3), { reading: 6 })).toEqual([]);
  });
});

describe('ensureFoundation', () => {
  async function pathAtPhase2(bands: object) {
    const user = await createUser();
    const [path] = await db
      .insert(ieltsPaths)
      .values({ userId: user.id, bandTargets: { listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 }, dailyMinutes: 120, restDays: [], startPhase: 2, endPhase: 6, startDate: quotaDay() })
      .returning();
    await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate: 0, bands });
    const { ensureSteps } = await import('./today.js');
    await ensureSteps(path);
    return path;
  }

  it('adds the pack once, keeps the queue in a unique order and leaves done steps where they were', async () => {
    const path = await pathAtPhase2({ listening: 5, reading: 6.5, writing: 4.5, speaking: 4 });
    const before = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id)).orderBy(asc(pathLessons.seq));
    await db.update(pathLessons).set({ status: 'done', doneAt: new Date() }).where(eq(pathLessons.id, before[0].id));
    const changed = await ensureFoundation(path);
    expect(changed).toBeGreaterThan(10);
    const after = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id)).orderBy(asc(pathLessons.seq));
    const dropped = before.filter((b) => !after.some((r) => r.id === b.id));
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((r) => r.block === 'reading' && r.kind === 'practice' && r.status === 'todo')).toBe(true);
    expect(after).toHaveLength(before.length - dropped.length + (changed - dropped.length));
    expect(after.map((r) => r.seq)).toEqual(after.map((_, i) => i));
    expect(after[0].id).toBe(before[0].id);
    // The old steps keep their relative order
    expect(after.filter((r) => before.some((b) => b.id === r.id)).map((r) => r.id)).toEqual(before.filter((b) => !dropped.some((d) => d.id === b.id)).map((r) => r.id));
    expect(after.filter((r) => (r.ref as { foundation?: boolean }).foundation).length).toBeGreaterThan(0);
    expect(await ensureFoundation(path)).toBe(0);
  });

  it('adds only the lessons the syllabus gained when the learner is stronger', async () => {
    const path = await pathAtPhase2({ listening: 5.5, reading: 5.5, writing: 5, speaking: 5 });
    expect(await ensureFoundation(path)).toBe(0);
    const rows = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id));
    // Take the lesson out of the stored queue, as if the phase had been stored before the syllabus gained it
    const lesson = rows.find((r) => (r.ref as { lessonId?: string }).lessonId === 'ip-w-task1-check')!;
    await db.delete(pathLessons).where(eq(pathLessons.id, lesson.id));
    expect(await ensureFoundation(path)).toBe(1);
    expect(await ensureFoundation(path)).toBe(0);
  });
});
