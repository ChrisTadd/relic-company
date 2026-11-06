import { HEROES, LOOT } from './data.mjs';
import { newSave } from './game.mjs';

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid save value');
  return value;
}

// Copy known progression fields only. Backups are exported from the contract board.
export function readBackup(raw) {
  if (raw?.version !== 1 || raw.run !== null || raw.last !== null) throw new Error('Expected a between-contracts save');
  const save = newSave(integer(raw.created));
  for (const field of ['coins', 'iron', 'dust', 'wins', 'runs', 'ladder', 'trophy', 'guarantee']) {
    save[field] = integer(raw[field]);
  }
  save.hq = integer(raw.hq, 0, 3);
  save.campaign = integer(raw.campaign, 0, 3);
  if (!Array.isArray(raw.owned) || new Set(raw.owned).size !== raw.owned.length ||
      !raw.owned.every(id => Object.hasOwn(LOOT.named, id)) || !Object.hasOwn(LOOT.named, raw.target)) {
    throw new Error('Invalid collection');
  }
  save.owned = [...raw.owned];
  save.target = raw.target;
  if (!Array.isArray(raw.milestones) || !raw.milestones.every(count => Number.isInteger(count)
      && Object.hasOwn(LOOT.milestoneDust, count) && count <= save.owned.length)) {
    throw new Error('Invalid milestones');
  }
  save.milestones = [...new Set(raw.milestones)];
  if (save.owned.includes('queen')) save.roster.queen = {};
  for (const id of Object.keys(save.roster)) {
    const hero = raw.roster[id];
    save.roster[id] = { xp: integer(hero.xp), spec: integer(hero.spec, -1, HEROES[id].specs.length - 1), gear: integer(hero.gear, 0, 3) };
  }
  if (!Array.isArray(raw.squad) || raw.squad.length > 3 || new Set(raw.squad).size !== raw.squad.length ||
      !raw.squad.every(id => Object.hasOwn(save.roster, id))) throw new Error('Invalid squad');
  save.squad = [...raw.squad];
  for (const id of Object.keys(save.kit)) save.kit[id] = raw.kit[id] === true && save.owned.includes(id);
  save.offline.started = raw.offline.started === null ? null : integer(raw.offline.started);
  return save;
}
