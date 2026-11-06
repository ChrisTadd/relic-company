import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOT, FOES } from '../data.mjs';
import { distance, nextTile } from '../map.mjs';
import {
  contract, validEncounter, castWindow, availablePerks, startRun, newSave, nextEncounter,
  bodyguard, focused, selectTarget, activate, tick, settle, level, upgrade, offlineCoins,
} from '../game.mjs';

function fixture(seed = 'march', tier = 0, configure = () => {}) {
  const save = newSave(0);
  configure(save);
  assert.ok(startRun(save, contract(seed, tier), 'first-roll'));
  return save;
}

test('seeded formations satisfy budgets and preserve tactical differences', () => {
  const signatures = new Set();
  for (let index = 0; index < 400; index++) {
    for (const tier of [0, 1, 2]) {
      const seed = 'march-' + index;
      const plan = contract(seed, tier, 'ladder', index % 18);
      assert.deepEqual(contract(seed, tier, 'ladder', index % 18), plan);
      for (const field of ['first', 'safe', 'elite', 'final']) {
        assert.ok(validEncounter(plan[field], tier, plan.modifier), seed + '/' + tier + '/' + field);
        signatures.add(plan.modifier + ':' + plan[field].roles.join(',') + ':' + plan[field].hazard);
      }
      assert.ok(plan.elite.budget > plan.safe.budget);
      assert.equal(availablePerks({ plan, index: 1, perks: [plan.drafts[1][0]] }).length, 3);
    }
  }
  assert.ok(signatures.size > 40);
  assert.equal(castWindow(FOES.seer.effect, 'quick', 0), 1.5);
  assert.ok(castWindow(FOES.seer.effect, 'ward', 0) > 1.5);
});

test('protected healers redirect strikes, while Deadeye reaches the back line', () => {
  const seed = Array.from({ length: 50 }, (_, index) => 'test-' + index).find(seed => {
    const plan = contract(seed, 0);
    return plan.modifier === 'guard' && plan.safe.roles.includes('healer');
  });
  assert.ok(seed);
  const { run } = fixture(seed, 0, save => { save.squad[2] = 'hunter'; });
  run.stage = 'interlude';
  assert.ok(nextEncounter(run, availablePerks(run)[0], 'safe'));
  const witch = run.enemies.find(foe => foe.key === 'healer');
  const guard = bodyguard(run, witch);
  assert.ok(guard);
  run.engagedAt = 0;
  run.nextFoeMove = 60;
  witch.visible = guard.visible = true;
  run.party.forEach(ally => { ally.cell = witch.cell; });
  assert.ok(selectTarget(run, witch.id));
  assert.equal(focused(run), witch);
  for (let i = 0; i < 8; i++) tick(run);
  assert.equal(witch.hp, witch.maxHp);
  assert.ok(guard.hp < guard.maxHp);
  assert.ok(activate(run, 'hunter'));
  assert.ok(witch.hp < witch.maxHp);
});

test('higher tiers introduce hazards and a new boss move with different responses', () => {
  const bossAt = tier => {
    const { run } = fixture('kiln', tier);
    for (let i = 0; i < 2; i++) {
      run.stage = 'interlude';
      nextEncounter(run, availablePerks(run)[0], 'safe');
    }
    run.nextStrike = run.nextAttack = 60;
    return run;
  };
  const ash = bossAt(0);
  while (!ash.cast) tick(ash);
  assert.equal(ash.cast.name, 'Kiln Verdict');
  const toll = bossAt(1);
  toll.castCount = 1;
  while (!toll.cast) tick(toll);
  assert.equal(toll.cast.name, 'Flare Grates');
  assert.equal(activate(toll, 'duelist'), false);
  const unguarded = structuredClone(toll);
  assert.ok(activate(toll, 'warden'));
  while (toll.cast) {
    tick(toll);
    tick(unguarded);
  }
  assert.ok(toll.party.every((ally, index) => ally.hp > unguarded.party[index].hp));
  const black = bossAt(2);
  const boss = black.enemies.find(foe => foe.key === 'boss');
  const barrier = boss.barrier;
  while (!black.cast) tick(black);
  assert.equal(black.cast.name, 'Crown of Coals');
  while (black.cast) tick(black);
  assert.ok(boss.barrier > barrier);
});

test('loss, upgrades and offline duty advance ordinary progression', () => {
  const save = fixture();
  const result = settle(save, 'loss');
  assert.equal(result.runs, 1);
  assert.ok(result.coins > 0 && result.iron > 0 && result.roster.warden.xp > 0);
  assert.equal(result.guarantee, 0);
  assert.equal(result.last.named.length, 0);
  assert.equal(result.last.trophy, false);
  assert.equal(settle(JSON.parse(JSON.stringify(result)), 'loss').runs, 1);
  result.offline.started = 0;
  assert.equal(offlineCoins(result, 299_999), 0);
  assert.equal(offlineCoins(result, 900_000), 3);
  assert.equal(offlineCoins(result, 86_400_000), 24);
  result.coins += 80;
  result.iron += 9;
  assert.ok(upgrade(result, 'gear', 'warden'));
  assert.ok(upgrade(result, 'hq'));
  assert.equal(result.roster.warden.gear, 1);
  assert.equal(result.hq, 1);
  assert.equal(level(result.roster.warden.xp), 1);
});

test('eligible clears award a named draw, target credit, milestones and duplicate dust once', () => {
  const first = settle(fixture(), 'win', { forceDrop: 'queen' });
  assert.equal(first.last.named[0].id, 'queen');
  assert.ok(first.roster.queen);
  assert.equal(first.campaign, 1);
  assert.equal(first.guarantee, 1);
  assert.deepEqual(first.milestones, [1]);
  assert.equal(level(first.roster.warden.xp), 2);
  first.last = null;
  first.guarantee = LOOT.guarantee - LOOT.credit[2];
  first.target = 'bell';
  assert.ok(startRun(first, contract('kiln', 2), 'another-roll'));
  first.target = 'saint';
  const second = settle(first, 'win', { forceDrop: 'queen' });
  assert.deepEqual(second.last.named, [
    { id: 'saint', duplicate: false, source: 'Guarantee' },
    { id: 'queen', duplicate: true, source: 'Active clear' },
  ]);
  assert.equal(second.guarantee, 0);
  assert.equal(second.target, 'bell');
  assert.equal(second.dust, first.dust + LOOT.duplicateDust);
  assert.deepEqual(settle(JSON.parse(JSON.stringify(second)), 'win'), second);
  second.last = null;
  assert.ok(startRun(second, contract('toll', 1, 'ladder'), 'ladder-first'));
  const third = settle(second, 'win', { forceDrop: 'bell' });
  assert.equal(third.ladder, 1);
  assert.equal(third.campaign, 1);
  assert.deepEqual(third.milestones, [1, 3]);
  assert.equal(third.last.dust, LOOT.milestoneDust[3]);
});

test('Bell interrupts, shatters wards and makes the caster vulnerable', () => {
  const { run } = fixture('ward', 0, save => {
    save.owned = ['bell'];
    save.kit.bell = true;
  });
  assert.equal(activate(run, 'duelist'), false);
  run.enemies.forEach(foe => { foe.barrier = 30; });
  while (!run.cast) tick(run);
  const foe = run.enemies[run.cast.id];
  const hp = foe.hp;
  assert.ok(activate(run, 'duelist'));
  assert.equal(run.cast, null);
  assert.ok(run.enemies.every(foe => foe.barrier === 0));
  assert.equal(foe.exposed, 5);
  assert.ok(Math.abs(hp - foe.hp - run.party[1].damage * 1.7 * 1.5) < 0.01);
});

test('Saint intercepts a lethal hit once, then the Queen summons an echo', () => {
  const { run } = fixture('saint', 0, save => {
    save.owned = ['queen', 'saint'];
    save.roster.queen = { xp: 0, spec: -1, gear: 0 };
    save.squad[2] = 'queen';
    save.kit.saint = true;
  });
  const lead = run.party[0];
  const [attacker, ...rest] = run.enemies;
  attacker.cell = lead.cell;
  attacker.visible = true;
  rest.forEach(foe => { foe.hp = 0; });
  run.nextStrike = run.nextFoeMove = 60;
  function lethal() {
    lead.hp = 1;
    run.nextAttack = run.time;
    tick(run);
  }
  lethal();
  assert.ok(run.saintUsed);
  assert.equal(lead.hp, lead.maxHp * 0.3);
  assert.equal(run.queenUsed, false);
  lethal();
  assert.ok(lead.echo && run.queenUsed);
  assert.ok(lead.hp > 0);
  assert.equal(activate(run, lead.key), false);
  lethal();
  assert.equal(lead.hp, 0);
});

test('serializing during combat preserves the exact next simulation step', () => {
  const { run } = fixture();
  while (!run.cast) tick(run);
  const restored = JSON.parse(JSON.stringify(run));
  for (let i = 0; i < 18; i++) {
    assert.equal(tick(restored), tick(run));
    assert.deepEqual(restored, run);
  }
});

test('seeded rooms are connected, vary between seeds and reveal foes through exploration', () => {
  const layouts = new Set();
  for (let index = 0; index < 120; index++) {
    const { run } = fixture('ruins-' + index, index % 3);
    const { map } = run;
    assert.deepEqual(fixture('ruins-' + index, index % 3).run.map, map);
    layouts.add(map.floor.join(''));
    for (const origin of [...map.starts, ...map.spawns]) {
      let cell = origin;
      for (let steps = 0; steps < map.floor.length && cell !== map.exit; steps++) {
        const next = nextTile(map, cell, map.exit);
        assert.equal(distance(cell, next), 1);
        assert.ok(map.floor[next]);
        cell = next;
      }
      assert.equal(cell, map.exit);
    }
    assert.ok(run.enemies.every(foe => !foe.visible));
    assert.equal(selectTarget(run, 0), false);
    for (let i = 0; i < 70 && !run.enemies.some(foe => foe.visible); i++) tick(run);
    assert.ok(run.enemies.some(foe => foe.visible));
    assert.notEqual(run.party[0].cell, map.starts[0]);
  }
  assert.ok(layouts.size > 30);
});

test('mercenaries pursue their nearest target until a tap orders a company rush', () => {
  const { run } = fixture('two-targets');
  const [near, far] = run.enemies;
  run.map.floor.fill(true);
  near.cell = 38;
  far.cell = 43;
  near.visible = far.visible = true;
  run.nextFoeMove = 60;
  run.party[0].cell = 47;
  run.party[1].cell = 52;
  for (let i = 0; i < 3; i++) tick(run);
  assert.equal(run.party[0].target, near.id);
  assert.equal(run.party[1].target, far.id);
  const previous = run.party[0].cell;
  assert.ok(selectTarget(run, far.id));
  for (let i = 0; i < 4; i++) tick(run);
  assert.ok(run.party.every(ally => ally.target === far.id));
  assert.ok(distance(run.party[0].cell, far.cell) < distance(previous, far.cell));
  assert.ok(selectTarget(run, null));
  assert.equal(run.focus, null);
});

test('a developed starter squad can clear all three campaign tiers on the safer route', () => {
  let save = newSave();
  const times = [];
  for (const tier of [0, 1, 2]) {
    startRun(save, contract('playtest1', tier), 'campaign-' + tier);
    const run = save.run;
    let steps = 0;
    let outcome;
    for (; !outcome && steps < 1440; steps++) {
      if (run.stage === 'interlude') {
        const offered = availablePerks(run);
        const perk = ['ash', 'tonic', 'resolve', 'keen', 'haste'].find(id => offered.includes(id));
        assert.ok(nextEncounter(run, perk, 'safe'));
      }
      const foe = run.enemies.find(enemy => enemy.hp > 0 && (enemy.key === 'guard' && run.plan.modifier === 'guard'))
        ?? run.enemies.find(enemy => enemy.hp > 0 && enemy.key === 'healer') ?? focused(run);
      if (foe) selectTarget(run, foe.id);
      if (run.cast && run.cast.end - run.time < 0.65 && !activate(run, 'duelist') && run.cast.effect !== 'heal') activate(run, 'warden');
      if (run.party.some(ally => ally.hp > 0 && ally.hp < ally.maxHp * 0.6)) activate(run, 'medic');
      outcome = tick(run);
    }
    assert.equal(outcome, 'win', 'tier ' + tier);
    times.push(steps / 10);
    save = settle(save, outcome, { forceDrop: undefined });
    assert.equal(save.campaign, tier + 1);
    save.last = null;
    upgrade(save, 'gear', 'duelist');
    if (tier === 1) upgrade(save, 'hq');
    for (const ally of run.party) save.roster[ally.key].spec = 0;
  }
  assert.ok(times.every(time => time >= 45 && time < 145), times.join(', '));
});
