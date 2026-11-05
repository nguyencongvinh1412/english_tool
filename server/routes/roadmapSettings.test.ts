import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';
import { DEFAULT_PLAN_SETTINGS } from '../roadmap/plan.js';
import { DEFAULT_THRESHOLDS } from '../roadmap/checkpoint.js';
import { planSettings } from '../roadmap/service.js';
import { checkpointThresholds } from '../roadmap/checkpoints.js';

const app = createApp();

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('admin roadmap settings', () => {
  it('is for admins only', async () => {
    const learner = await signIn(app, await createUser());
    expect((await learner.get('/api/admin/roadmap/settings')).status).toBe(403);
    expect((await request(app).get('/api/admin/roadmap/settings')).status).toBe(401);
  });

  it('shows the defaults, saves changes that the plan then uses, and resets', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const first = (await admin.get('/api/admin/roadmap/settings')).body;
    expect(first.plan.hoursPerLevel.B1).toBe(DEFAULT_PLAN_SETTINGS.hoursPerLevel.B1);
    expect(first.customised).toBe(false);

    const changed = { plan: { ...first.plan, hoursPerLevel: { ...first.plan.hoursPerLevel, B1: 180 } }, checkpoint: { unlock: 0.9, passOverall: 0.75, passMinSkill: 0.55 } };
    expect((await admin.put('/api/admin/roadmap/settings').send(changed)).status).toBe(200);
    expect((await planSettings()).hoursPerLevel.B1).toBe(180);
    expect((await checkpointThresholds()).unlock).toBe(0.9);
    expect((await admin.get('/api/admin/roadmap/settings')).body.customised).toBe(true);

    await admin.put('/api/admin/roadmap/settings').send({ reset: true });
    expect((await planSettings()).hoursPerLevel.B1).toBe(DEFAULT_PLAN_SETTINGS.hoursPerLevel.B1);
    expect(await checkpointThresholds()).toEqual(DEFAULT_THRESHOLDS);
  });

  it('previews the effect of a change on a typical plan without saving it', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const { plan } = (await admin.get('/api/admin/roadmap/settings')).body;
    const slower = { ...plan, hoursPerLevel: Object.fromEntries(Object.entries(plan.hoursPerLevel).map(([level, h]) => [level, (h as number) * 2])) };
    const preview = (await admin.post('/api/admin/roadmap/settings/preview').send({ plan: slower })).body;
    expect(preview.proposed.totalHours).toBeGreaterThan(preview.current.totalHours);
    expect((await planSettings()).hoursPerLevel.B1).toBe(DEFAULT_PLAN_SETTINGS.hoursPerLevel.B1);
  });

  it('keeps skill weights per goal, and refuses weights that do not add up to 100', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const { plan, checkpoint } = (await admin.get('/api/admin/roadmap/settings')).body;
    expect(plan.skillWeights.toeic).toMatchObject({ listening: 35, reading: 35, grammar: 20, vocabulary: 10 });

    const off = { ...plan, skillWeights: { ...plan.skillWeights, toeic: { ...plan.skillWeights.toeic, listening: 40 } } };
    expect((await admin.put('/api/admin/roadmap/settings').send({ plan: off, checkpoint })).status).toBe(400);

    const good = { ...plan, skillWeights: { ...plan.skillWeights, toeic: { ...plan.skillWeights.toeic, listening: 30, reading: 40 } } };
    expect((await admin.put('/api/admin/roadmap/settings').send({ plan: good, checkpoint })).status).toBe(200);
    expect((await planSettings()).skillWeights.toeic.reading).toBe(40);
  });

  it('refuses values that make no sense', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const { plan } = (await admin.get('/api/admin/roadmap/settings')).body;
    const bad = await admin.put('/api/admin/roadmap/settings').send({ plan, checkpoint: { unlock: 0.8, passOverall: 0.6, passMinSkill: 0.7 } });
    expect(bad.status).toBe(400);
    const tooFew = await admin.put('/api/admin/roadmap/settings').send({ plan: { ...plan, hoursPerLevel: { ...plan.hoursPerLevel, B1: 1 } }, checkpoint: { unlock: 0.8, passOverall: 0.7, passMinSkill: 0.5 } });
    expect(tooFew.status).toBe(400);
  });
});
