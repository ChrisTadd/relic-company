import test from 'node:test';
import assert from 'node:assert/strict';
import { readBackup } from '../backup.mjs';
import { newSave } from '../game.mjs';

test('save backup keeps roster, gear, collection, payout and offline duty', () => {
  const save = newSave(100);
  save.coins = 79;
  save.roster.warden = { xp: 91, gear: 2, spec: 1 };
  save.owned = ['bell', 'queen'];
  save.roster.queen = { xp: 1, gear: 0, spec: -1 };
  save.kit.bell = true;
  save.squad = ['queen', 'warden', 'duelist'];
  save.milestones = [1];
  save.guarantee = 8;
  save.offline.started = 120;
  assert.deepEqual(readBackup(JSON.parse(JSON.stringify(save))), save);
});

test('save backup rejects invalid progression and unsupported run state', () => {
  const save = newSave();
  assert.throws(() => readBackup({ ...save, coins: '<script>' }));
  assert.throws(() => readBackup({ ...save, squad: ['warden', 'warden'] }));
  assert.throws(() => readBackup({ ...save, owned: ['unknown'] }));
  assert.throws(() => readBackup({ ...save, run: { stage: 'combat' } }));
});
