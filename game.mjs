import { HEROES, FOES, TIERS, MODIFIERS, HAZARDS, PERKS, FORMATIONS, LOOT } from './data.mjs';
import { inRange, makeMap, nearest, nextTile } from './map.mjs';

export const STEP = 0.1;
export const STARTERS = ['warden', 'duelist', 'medic', 'hunter'];
export const OFFLINE_INTERVAL = 300_000;
const ROUND_LIMIT = 48;
const SIGHT = 5;
const allyRange = { warden: 1, duelist: 1, medic: 3, hunter: 4, queen: 3 };
const foeRange = { guard: 1, healer: 3, hound: 1, seer: 3, boss: 1 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const living = units => units.filter(unit => unit.hp > 0);
const lowest = units => living(units).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
const remaining = (timer, time) => Math.max(0, Math.round((timer - time) * 1000) / 1000);
const heal = (unit, amount) => { unit.hp = Math.min(unit.maxHp, unit.hp + amount); };

export function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) result = Math.imul(result ^ char.codePointAt(0), 16777619);
  return result >>> 0;
}

export function random(seed) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function draft(items, count, rng) {
  const bag = [...items];
  return Array.from({ length: count }, () => bag.splice(Math.floor(rng() * bag.length), 1)[0]);
}

const cost = roles => roles.reduce((total, role) => total + FOES[role].cost, 0);
const bossForms = [['boss'], ...Object.keys(FOES).filter(role => role !== 'boss').map(role => ['boss', role]), ['boss', 'hound', 'guard'], ['boss', 'hound', 'seer']];

export function castWindow(effect, modifier, tier) {
  if (effect === 'hex') return modifier === 'quick' ? 1.5 : 2.2;
  if (effect === 'heal') return 2.7;
  if (effect === 'blast' || effect === 'grates' || effect === 'smoke') return 2.8;
  return tier === 2 ? 2.1 : 2.4;
}

export function validEncounter(encounter, tier, modifier) {
  const { roles, budget, hazard, boss } = encounter;
  return roles.length <= 3 && roles.length === new Set(roles).size
    && roles.every(role => Object.hasOwn(FOES, role))
    && cost(roles) <= budget && cost(roles) >= budget - 2
    && roles.includes('boss') === boss && TIERS[tier].hazards.includes(hazard)
    && (tier > 0 || !boss || roles.length <= 2)
    && roles.every(role => castWindow(FOES[role].effect, modifier, tier) >= 1.5);
}

export function contract(seed, tier, mode = 'campaign', rung = 0) {
  const rng = random(seed + '|' + tier + '|' + mode + '|' + rung);
  const modifier = pick(Object.keys(MODIFIERS), rng);
  const preferred = { guard: 'guard', quick: 'seer', blood: 'healer' }[modifier];
  function generate(index, elite = false) {
    const boss = index === 2;
    const budget = TIERS[tier].budget[index] + Number(elite) + Number(rung >= 4 && index > 0);
    const hazard = tier > 0 && (index > 0 || elite)
      ? pick(TIERS[tier].hazards.filter(key => key !== 'none'), rng) : 'none';
    const legalHazard = TIERS[tier].hazards.includes(hazard) ? hazard : pick(TIERS[tier].hazards, rng);
    const candidates = (boss ? bossForms : FORMATIONS)
      .map(roles => ({ roles, budget, hazard: legalHazard, boss, elite }))
      .filter(candidate => validEncounter(candidate, tier, modifier));
    const preferredForms = candidates.filter(candidate => candidate.roles.includes(preferred));
    const pool = preferredForms.length ? preferredForms : candidates;
    const maxCost = Math.max(...pool.map(candidate => cost(candidate.roles)));
    return pick(pool.filter(candidate => cost(candidate.roles) >= maxCost - Number(!elite)), rng);
  }
  const first = generate(0);
  const safe = generate(1);
  const elite = generate(1, true);
  const final = generate(2);
  return { seed, tier, mode, rung, modifier, first, safe, elite, final,
    drafts: [draft(Object.keys(PERKS), 3, rng), draft(Object.keys(PERKS), Object.keys(PERKS).length, rng)] };
}

export const availablePerks = run => run.plan.drafts[run.index].filter(id => !run.perks.includes(id)).slice(0, 3);

export function newSave(now = Date.now()) {
  return {
    version: 1, coins: 0, iron: 0, dust: 0, hq: 0, wins: 0, runs: 0, campaign: 0, ladder: 0,
    roster: Object.fromEntries(STARTERS.map(id => [id, { xp: 0, spec: -1, gear: 0 }])),
    owned: [], milestones: [], trophy: 0, guarantee: 0, target: 'queen',
    squad: STARTERS.slice(0, 3), kit: { bell: false, saint: false },
    offline: { started: null }, run: null, last: null, created: now,
  };
}

export const level = xp => Math.min(10, 1 + Math.floor(xp / 30));
export const gearPrice = rank => ({ coins: 20 + 22 * rank, iron: 3 + 3 * rank });
export const hqPrice = rank => ({ coins: 34 + 32 * rank, iron: 4 + 4 * rank });
export const offlineCoins = (save, now = Date.now()) => save.offline.started === null ? 0
  : Math.floor(clamp(now - save.offline.started, 0, OFFLINE_INTERVAL * 24) / OFFLINE_INTERVAL);

export function upgrade(save, kind, heroId) {
  const hero = save.roster[heroId];
  if (kind !== 'hq' && (kind !== 'gear' || !hero)) return false;
  const rank = kind === 'hq' ? save.hq : hero.gear;
  const price = kind === 'hq' ? hqPrice(rank) : gearPrice(rank);
  if (rank >= 3 || save.coins < price.coins || save.iron < price.iron) return false;
  save.coins -= price.coins;
  save.iron -= price.iron;
  if (kind === 'hq') save.hq++;
  else hero.gear++;
  return true;
}

export function startRun(save, plan, id) {
  if (save.run || save.last || save.squad.length !== 3 || new Set(save.squad).size !== 3
    || save.squad.some(key => !save.roster[key])) return false;
  save.run = {
    id, plan, index: 0, stage: 'combat', path: null, perks: [], pending: null,
    kit: { bell: save.kit.bell && save.owned.includes('bell'), saint: save.kit.saint && save.owned.includes('saint') },
    party: save.squad.map(key => {
      const profile = save.roster[key];
      const hero = HEROES[key];
      const rank = level(profile.xp);
      const maxHp = hero.hp + (rank - 1) * 7 + profile.gear * 7 + save.hq * 8;
      return { key, hp: maxHp, maxHp, spec: rank >= 2 ? profile.spec : -1,
        damage: hero.damage + (rank - 1) * 1.4 + profile.gear * 2 + save.hq, cd: 0,
        ward: 0, echo: false };
    }),
  };
  beginEncounter(save.run, plan.first);
  return true;
}

function beginEncounter(run, encounter) {
  run.stage = 'combat';
  run.encounter = encounter;
  run.time = 0;
  run.nextStrike = 0.8;
  run.nextAttack = 2.5;
  run.nextCast = 5.2;
  run.castCount = 0;
  run.cast = null;
  run.guard = 0;
  run.smoke = 0;
  run.queenUsed = false;
  run.saintUsed = false;
  run.notice = { text: 'Steel drawn', kind: '', at: 0 };
  const tier = TIERS[run.plan.tier];
  const intensity = 1 + Math.min(run.plan.rung, 12) * 0.023 + Number(encounter.elite) * 0.1;
  run.enemies = encounter.roles.map((key, index) => {
    const maxHp = Math.round(FOES[key].hp * tier.hp * intensity * 1.08);
    return { key, id: index, hp: maxHp, maxHp, barrier: run.plan.modifier === 'ward' ? 19 : 0,
      exposed: 0, damage: FOES[key].damage * tier.damage * intensity };
  });
  run.map = null;
  prepareMap(run);
  for (const ally of run.party) {
    if (ally.echo) {
      ally.hp = 0;
      ally.echo = false;
    }
    if (ally.hp > 0 && run.index > 0) heal(ally, ally.maxHp * 0.24);
    ally.cd = 0;
    ally.ward = 0;
  }
}

export function prepareMap(run) {
  if (run.map) return;
  const { seed, tier, mode, rung } = run.plan;
  run.map = makeMap(random([seed, tier, mode, rung, run.index, run.path, 'terrain'].join('|')), run.enemies.length);
  run.focus = null;
  run.engagedAt = null;
  run.nextMove = run.time + 0.3;
  run.nextFoeMove = run.time + 0.8;
  run.cast = null;
  run.party.forEach((ally, i) => {
    ally.cell = run.map.starts[i];
    ally.target = null;
    ally.struck = -10;
  });
  run.enemies.forEach((foe, i) => {
    foe.cell = run.map.spawns[i];
    foe.hit = -10;
    foe.visible = false;
  });
  reveal(run);
}

function reveal(run) {
  const allies = living(run.party);
  const sees = cell => allies.some(ally => inRange(run.map, ally.cell, cell, SIGHT));
  run.map.seen.forEach((seen, cell) => {
    if (!seen && run.map.floor[cell] && sees(cell)) run.map.seen[cell] = true;
  });
  for (const foe of run.enemies) {
    if (foe.hp > 0) foe.visible ||= sees(foe.cell);
  }
}

export function nextEncounter(run, perk, path) {
  if (run.stage !== 'interlude' || !availablePerks(run).includes(perk)
    || (run.index === 0 && !['safe', 'elite'].includes(path))) return false;
  run.pending = null;
  if (run.index === 0) run.path = path;
  if (perk === 'tonic') living(run.party).forEach(ally => heal(ally, ally.maxHp * 0.32));
  else if (perk === 'ash') {
    const fallen = run.party.find(ally => ally.hp <= 0 || ally.echo);
    if (fallen) {
      fallen.echo = false;
      fallen.hp = Math.max(fallen.hp, Math.ceil(fallen.maxHp / 2));
    }
    else living(run.party).forEach(ally => heal(ally, ally.maxHp * 0.18));
  }
  else if (!run.perks.includes(perk)) run.perks.push(perk);
  run.index++;
  beginEncounter(run, run.index === 1 ? run.plan[run.path] : run.plan.final);
  return true;
}

function notice(run, text, kind = '') {
  run.notice = { text, kind, at: run.time };
}

export function focused(run) {
  const lead = living(run.party)[0];
  return lead ? targetFor(run, lead) : null;
}

function targetFor(run, ally) {
  const visible = run.enemies.filter(foe => foe.visible && foe.hp > 0);
  return visible.find(foe => foe.id === run.focus) ?? nearest(ally.cell, visible);
}

export function selectTarget(run, id) {
  if (run?.stage !== 'combat' || (id !== null && !run.enemies.some(foe => foe.id === id && foe.hp > 0 && foe.visible))) return false;
  run.focus = id;
  return true;
}

export function bodyguard(run, foe) {
  if (run.plan.modifier !== 'guard' || !foe || foe.key === 'guard') return null;
  return living(run.enemies).find(enemy => enemy.key === 'guard' && inRange(run.map, enemy.cell, foe.cell, 4)) ?? null;
}

function hurtEnemy(run, target, damage, pierce = false) {
  const foe = (!pierce && bodyguard(run, target)) || target;
  let blow = damage * (foe.exposed > 0 ? 1.5 : 1);
  if (!pierce && foe.barrier > 0) {
    const absorbed = Math.min(foe.barrier, blow);
    foe.barrier -= absorbed;
    blow -= absorbed;
  }
  foe.hp = Math.max(0, foe.hp - blow);
  foe.hit = run.time;
  if (foe.hp === 0 && run.cast?.id === foe.id) {
    run.cast = null;
    run.nextCast = run.time + 3;
    notice(run, 'Caster slain', 'good');
  }
}

function hurtAlly(run, ally, damage) {
  const blow = damage * (run.guard > 0 ? 0.34 : 1) * (ally.ward > 0 ? 0.44 : 1)
    * (run.perks.includes('resolve') ? 0.77 : 1);
  if (ally.hp > blow) {
    ally.hp -= blow;
    return;
  }
  if (!run.saintUsed && run.kit.saint) {
    run.saintUsed = true;
    ally.hp = ally.maxHp * 0.3;
    notice(run, 'The Gutter Saint intercepted a lethal blow', 'good');
    return;
  }
  ally.hp = 0;
  const queen = living(run.party).find(unit => unit.key === 'queen');
  if (!run.queenUsed && queen && !ally.echo) {
    run.queenUsed = true;
    ally.echo = true;
    ally.hp = ally.maxHp * (queen.spec === 0 ? 0.55 : 0.34);
    notice(run, 'The Ash Queen summoned ' + HEROES[ally.key].name + ' as an echo', 'good');
  }
}

export function abilityReady(run, ally) {
  if (ally?.hp <= 0 || !ally || ally.cd > 0 || ally.echo || run.engagedAt === null || !living(run.enemies).length) return false;
  if (ally.key === 'duelist') return !!run.cast && run.cast.id >= 0;
  if (ally.key === 'hunter') {
    const target = targetFor(run, ally);
    return !!target && inRange(run.map, ally.cell, target.cell, 6);
  }
  return true;
}

export function activate(run, id) {
  if (run?.stage !== 'combat') return false;
  const ally = run.party.find(unit => unit.key === id);
  if (!abilityReady(run, ally)) return false;
  const { spec } = ally;
  ally.cd = HEROES[id].speed;
  notice(run, HEROES[id].ability, 'good');
  switch (id) {
    case 'warden':
      run.guard = spec === 0 ? 5 : 3.5;
      break;
    case 'duelist': {
      const caster = run.enemies.find(foe => foe.id === run.cast.id);
      run.cast = null;
      run.nextCast = run.time + (run.plan.tier === 2 ? 4.2 : 5.8);
      if (spec === 0) ally.cd *= 0.72;
      if (run.kit.bell) {
        run.enemies.forEach(foe => { foe.barrier = 0; });
        caster.exposed = 5;
      }
      hurtEnemy(run, caster, ally.damage * (spec === 1 ? 2.9 : 1.7), true);
      notice(run, run.kit.bell ? 'Interrupted · barriers shattered · exposed' : 'Interrupted ' + FOES[caster.key].name, 'good');
      break;
    }
    case 'medic':
      living(run.party).forEach(unit => heal(unit, unit.maxHp * (spec === 0 ? 0.36 : 0.26)));
      if (spec === 1) ally.cd *= 0.72;
      break;
    case 'hunter':
      hurtEnemy(run, targetFor(run, ally), ally.damage * (spec === 0 ? 4.3 : 3.1), true);
      if (spec === 1) ally.cd *= 0.72;
      break;
    case 'queen':
      lowest(run.party).ward = 6;
      break;
  }
  return true;
}

function createCast(run) {
  const enemies = living(run.enemies).filter(foe => foe.visible);
  if (!enemies.length) return;
  const caster = enemies[run.castCount % enemies.length];
  const tier = run.plan.tier;
  const hazard = HAZARDS[run.encounter.hazard];
  const environmental = hazard.effect && run.castCount % 3 === 1;
  const flare = caster.key === 'boss' && tier > 0 && run.castCount % 3 === 2;
  const coronation = caster.key === 'boss' && tier === 2 && run.castCount % 3 === 0;
  const effect = environmental ? hazard.effect : flare ? 'grates' : coronation ? 'coronation' : FOES[caster.key].effect;
  const name = environmental ? hazard.move : flare ? 'Furnace Sweep' : coronation ? 'Crown of Coals' : FOES[caster.key].move;
  const duration = castWindow(effect, run.plan.modifier, tier);
  run.cast = { id: environmental ? -1 : caster.id, effect, name, end: run.time + duration, duration };
  run.castCount++;
}

function resolveCast(run) {
  const { effect, id, name } = run.cast;
  const caster = run.enemies[id];
  const scale = TIERS[run.plan.tier].damage * (1 + Number(run.encounter.elite) * 0.14 + Math.min(run.plan.rung, 12) * 0.03);
  run.cast = null;
  run.nextCast = run.time + (run.plan.tier === 2 ? 3.1 : 4.2);
  notice(run, name + ' landed', 'bad');
  switch (effect) {
    case 'heal':
      living(run.enemies).forEach(foe => heal(foe, foe.maxHp * (run.plan.modifier === 'blood' ? 0.35 : 0.23)));
      break;
    case 'slam':
      hurtAlly(run, living(run.party)[0], 32 * scale);
      if (run.plan.tier > 0) caster.barrier += 17;
      break;
    case 'lunge':
      hurtAlly(run, lowest(run.party), 37 * scale);
      break;
    case 'hex':
      hurtAlly(run, lowest(run.party), 43 * scale);
      break;
    case 'smoke':
      run.smoke = 6;
      living(run.party).forEach(ally => hurtAlly(run, ally, 13 * scale));
      break;
    case 'coronation':
      caster.barrier += 33;
      living(run.party).forEach(ally => hurtAlly(run, ally, 23 * scale));
      break;
    default:
      living(run.party).forEach(ally => hurtAlly(run, ally, (effect === 'blast' ? 28 : 18) * scale));
  }
}

function moveUnits(run) {
  if (run.time >= run.nextMove) {
    const activeFocus = run.enemies.some(foe => foe.visible && foe.hp > 0 && foe.id === run.focus);
    run.nextMove = run.time + (activeFocus ? 0.2 : 0.3);
    for (const ally of living(run.party)) {
      const target = targetFor(run, ally);
      ally.target = target?.id ?? null;
      if (!target || !inRange(run.map, ally.cell, target.cell, allyRange[ally.key])) {
        ally.cell = nextTile(run.map, ally.cell, target?.cell ?? run.map.exit);
      }
    }
    reveal(run);
  }
  if (run.time >= run.nextFoeMove) {
    run.nextFoeMove = run.time + 0.8;
    const allies = living(run.party);
    for (const foe of living(run.enemies)) {
      if (!foe.visible || foe.id === run.cast?.id || foe.key === 'healer') continue;
      const target = nearest(foe.cell, allies);
      if (target && !inRange(run.map, foe.cell, target.cell, foeRange[foe.key])) {
        const next = nextTile(run.map, foe.cell, target.cell);
        if (!run.enemies.some(other => other !== foe && other.hp > 0 && other.cell === next)) foe.cell = next;
      }
    }
    reveal(run);
  }
}

export function tick(run) {
  if (run?.stage !== 'combat') return null;
  if (!living(run.party).length) return 'loss';
  prepareMap(run);
  run.time = Math.round((run.time + STEP) * 10) / 10;
  run.guard = remaining(run.guard, STEP);
  run.smoke = remaining(run.smoke, STEP);
  run.enemies.forEach(foe => { foe.exposed = remaining(foe.exposed, STEP); });
  run.party.forEach(ally => {
    ally.cd = remaining(ally.cd, STEP * (run.perks.includes('haste') ? 1.25 : 1));
    ally.ward = remaining(ally.ward, STEP);
  });
  moveUnits(run);
  if (run.engagedAt === null && focused(run)) {
    run.engagedAt = run.time;
    run.nextStrike = Math.max(run.nextStrike, run.time + 0.4);
    run.nextCast = Math.max(run.nextCast, run.time + 1.5);
    notice(run, 'Enemies sighted', 'bad');
  }
  if (run.time >= run.nextStrike && focused(run)) {
    run.nextStrike = run.time + 1.9;
    const queen = run.party.find(ally => ally.key === 'queen');
    for (const ally of living(run.party)) {
      const target = targetFor(run, ally);
      if (!target || !inRange(run.map, ally.cell, target.cell, allyRange[ally.key])) continue;
      const force = (ally.key === 'warden' && ally.spec === 1 ? 1.28 : 1)
        * (run.perks.includes('keen') ? 1.2 : 1) * (run.smoke > 0 ? 0.65 : 1)
        * (ally.echo ? (queen?.spec === 1 ? 0.95 : 0.68) : 1);
      hurtEnemy(run, target, ally.damage * force);
      ally.struck = run.time;
    }
  }
  if (!living(run.enemies).length) {
    if (!living(run.party).some(ally => ally.cell === run.map.exit)) return null;
    if (run.index === 2) return 'win';
    run.stage = 'interlude';
    run.pending = { perk: null, path: null };
    return null;
  }
  if (run.cast && run.time >= run.cast.end) resolveCast(run);
  else if (!run.cast && run.time >= run.nextCast) createCast(run);
  if (run.time >= run.nextAttack) {
    run.nextAttack = run.time + 3.4;
    for (const foe of living(run.enemies)) {
      const target = living(run.party).find(ally => inRange(run.map, ally.cell, foe.cell, foeRange[foe.key]));
      if (target) hurtAlly(run, target, foe.damage);
    }
  }
  if (!living(run.party).length || (run.engagedAt !== null && run.time - run.engagedAt >= ROUND_LIMIT)) return 'loss';
  return null;
}

function grantNamed(save, id, source, result) {
  const duplicate = save.owned.includes(id);
  result.named.push({ id, duplicate, source });
  if (duplicate) {
    save.dust += LOOT.duplicateDust;
    result.dust += LOOT.duplicateDust;
    return;
  }
  save.owned.push(id);
  if (id === 'queen') save.roster.queen = { xp: 0, spec: -1, gear: 0 };
  const count = save.owned.length;
  if (LOOT.milestoneDust[count] && !save.milestones.includes(count)) {
    const dust = LOOT.milestoneDust[count];
    save.milestones.push(count);
    save.dust += dust;
    result.dust += dust;
    result.milestone = count;
  }
}

// The caller commits the returned save and results together in one storage write.
export function settle(save, outcome, options = {}) {
  if (!save.run) return save;
  const settled = structuredClone(save);
  const run = settled.run;
  const { tier, mode, seed, rung } = run.plan;
  const won = outcome === 'win';
  const eliteCleared = run.path === 'elite' && run.index === 2;
  const coins = won ? TIERS[tier].coins + (eliteCleared ? 22 : 0) + rung * 2 : 13 + tier * 3 + run.index * 7 + (eliteCleared ? 8 : 0);
  const iron = (won ? 5 + tier * 2 : 2 + run.index) + Number(eliteCleared) * 2;
  const xp = won ? 30 + tier * 7 + (eliteCleared ? 12 : 0) : 12 + run.index * 5;
  const result = { id: run.id, won, seed, tier, mode, coins, iron, xp, dust: 0, named: [], trophy: false,
    eliteCleared, completed: run.index + Number(won), cause: options.cause ?? null, credit: 0, ranks: [] };
  settled.coins += coins;
  settled.iron += iron;
  settled.runs++;
  for (const ally of run.party) {
    const profile = settled.roster[ally.key];
    const before = level(profile.xp);
    profile.xp += xp;
    if (level(profile.xp) > before) result.ranks.push({ key: ally.key, rank: level(profile.xp) });
  }
  if (won) {
    settled.wins++;
    if (mode === 'campaign' && tier === settled.campaign) settled.campaign++;
    if (mode === 'ladder' && rung === settled.ladder) settled.ladder++;
    const rng = random(run.id + '|rewards');
    const odds = LOOT.chance[tier];
    const names = Object.keys(LOOT.named);
    const rolled = names[Math.floor(rng() / odds)];
    const drop = Object.hasOwn(options, 'forceDrop') ? options.forceDrop : rolled;
    const trophy = rng() < LOOT.trophyChance[tier];
    result.credit = LOOT.credit[tier];
    settled.guarantee += result.credit;
    if (settled.guarantee >= LOOT.guarantee) {
      settled.guarantee -= LOOT.guarantee;
      grantNamed(settled, settled.target, 'Guarantee', result);
      const missing = names.find(id => !settled.owned.includes(id));
      if (missing) settled.target = missing;
    }
    if (names.includes(drop)) grantNamed(settled, drop, 'Active clear', result);
    if (trophy) {
      settled.trophy++;
      result.trophy = true;
    }
  }
  settled.last = result;
  settled.run = null;
  return settled;
}
