import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestDatabase } from './sqliteAdapter';
import { initializeSampleDatabase as initializeDatabase } from '../src/db/database';
import { migrateDatabase } from '../src/db/migrations';
import { appNow } from '../src/utils/appClock';
import { localDate } from '../src/utils/date';
import { firstReviewDue } from '../src/services/initialReviewSchedule';
import { getHomeData } from '../src/services/homeService';
import { startStudy } from '../src/services/studyService';
import { checkIn } from '../src/services/checkinService';

test('app clock always uses the real device date in both development and production', () => {
  for (const flag of [true, false]) {
    Object.assign(globalThis, { __DEV__: flag });
    const before = Date.now(); const actual = appNow().getTime();
    assert.ok(actual >= before && actual <= Date.now());
  }
});

test('next review uses local midnight across DST and leap day', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(firstReviewDue(new Date(2026, 2, 8, 0), 1).getTime() - new Date(2026, 2, 8, 0).getTime(), 23 * 3600000);
    assert.equal(localDate(firstReviewDue(new Date(2028, 1, 28, 20), 1)), '2028-02-29');
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('v5 migration deletes only the debug setting and preserves prior learning and preferences', async () => {
  const { db, close } = openTestDatabase();
  try {
    await initializeDatabase(db);
    const started = await startStudy(db, { createId: randomUUID });
    if (started.kind !== 'session') throw Error('Missing study');
    const v = started.session.getSnapshot(); if (v.status !== 'prompt') throw Error('Missing prompt');
    await started.session.submitChoice(v.token, v.item.word.wordId);
    await checkIn(db);
    await db.runAsync("INSERT INTO settings VALUES ('dev_date_offset_days', '9999')");
    const tables = ['words', 'meanings', 'examples', 'cards', 'review_logs', 'study_rounds', 'checkins'];
    const before = await Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table}`)));
    const settings = await db.getAllAsync("SELECT * FROM settings WHERE key <> 'dev_date_offset_days'");
    await db.execAsync(`DROP TABLE study_completion; DROP TABLE familiar_actions; DROP TABLE familiar_marks;
      ALTER TABLE sessions DROP COLUMN manual_count; DROP INDEX idx_review_word_day;
      DELETE FROM word_books WHERE id = 'my-familiar'; PRAGMA user_version = 4;`);
    await migrateDatabase(db); await migrateDatabase(db);
    assert.deepEqual(await Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table}`))), before);
    assert.deepEqual(await db.getAllAsync('SELECT * FROM settings'), settings);
    assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) n FROM word_books WHERE id = 'my-familiar'"))!.n, 1);
    assert.equal(localDate(appNow()), localDate(new Date()));
  } finally { close(); }
});

test('explicit service dates drive daily quotas, 1/3/5-day review counts, checkins, and persistent daily rounds', async () => {
  let now = new Date(2028, 1, 28, 12);
  const folder = mkdtempSync(join(tmpdir(), 'french-debug-round-'));
  const path = join(folder, 'app.db');
  let store = openTestDatabase(path);
  try {
    await initializeDatabase(store.db);
    now = new Date('2028-02-28T12:00:00');
    const initial = await getHomeData(store.db, now);
    assert.equal(initial.learnedToday, 0); assert.equal(initial.availableNewWords, 10); assert.equal(initial.due, 0);
    const first = await startStudy(store.db, { createId: randomUUID, now: () => now });
    assert.equal(first.kind, 'session'); if (first.kind !== 'session') throw new Error('Missing session');
    let firstRatings = 0;
    for (let turn = 0; turn < 40; turn++) {
      const view = first.session.getSnapshot();
      if (view.status === 'completed') break;
      if (view.status === 'prompt') {
        const rating = view.item.attempt > 1 ? 'known' : firstRatings++ === 0 ? 'unknown' : firstRatings === 2 ? 'uncertain' : 'known';
        if (view.item.phase === 'choice' && rating === 'known') await first.session.submitChoice(view.token, view.item.word.wordId);
        else await first.session.submitRating(view.token, rating);
      }
      await first.session.continue(view.token);
    }
    assert.equal(first.session.getSnapshot().status, 'completed');
    const learned = await getHomeData(store.db, now);
    assert.equal(learned.learnedToday, 10); assert.equal(learned.due, 0); assert.equal(learned.roundComplete, true); assert.equal(learned.checkin.checkedIn, true);
    for (const [date, expectedDue] of [['2028-02-29', 1], ['2028-03-02', 2], ['2028-03-04', 10]] as const) {
      now = new Date(date + 'T12:00:00');
      const home = await getHomeData(store.db, now);
      assert.equal(home.due, expectedDue, date); assert.equal(home.learnedToday, 0); assert.equal(home.availableNewWords, 10);
    }
    now = new Date('2028-02-29T12:00:00');
    assert.equal((await getHomeData(store.db, now)).checkin.checkedIn, false);
    await checkIn(store.db, now);
    assert.equal((await getHomeData(store.db, now)).checkin.streak, 2);
    const second = await startStudy(store.db, { createId: randomUUID, now: () => now });
    if (second.kind !== 'session') throw new Error('Missing next day');
    assert.notEqual(second.session.id, first.session.id);
    const view = second.session.getSnapshot();
    if (view.status !== 'prompt') throw new Error('Missing next word');
    await second.session.submitChoice(view.token, view.item.word.wordId);
    assert.equal((await getHomeData(store.db, now)).learnedToday, 1);
    // Mimic killing the app: the database is reopened without an app clock override.
    store.close(); store = openTestDatabase(path);
    await initializeDatabase(store.db);
    assert.equal(localDate(now), '2028-02-29');
    assert.equal((await getHomeData(store.db, now)).learnedToday, 1);
    const resumed = await startStudy(store.db, { createId: randomUUID, now: () => now });
    if (resumed.kind !== 'session') throw new Error('Missing saved round');
    assert.equal(resumed.session.id, second.session.id); assert.equal(resumed.session.getSnapshot().status, 'answer');
    now = new Date('2028-02-28T12:00:00');
    const prior = await startStudy(store.db, { createId: randomUUID, now: () => now });
    if (prior.kind !== 'session') throw new Error('Missing old round');
    assert.equal(prior.session.id, second.session.id); assert.equal(prior.session.getSnapshot().status, 'answer');
    assert.equal((await getHomeData(store.db, now)).learnedToday, 10);
    assert.equal(localDate(), localDate(new Date()));
    assert.equal((await store.db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM cards'))?.n, 11);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});
