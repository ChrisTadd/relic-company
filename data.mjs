export const REGION = 'The Cinder March';

export const HEROES = {
  warden: { name: 'Mara', role: 'Warden', mark: '◈', hp: 126, damage: 7, speed: 10, ability: 'Brace', help: 'Guard the company against the next blow.', specs: ['Bulwark · longer guard', 'Vanguard · stronger strikes'] },
  duelist: { name: 'Rook', role: 'Duelist', mark: '✦', hp: 88, damage: 11, speed: 8, ability: 'Cut Cast', help: 'Interrupt the focused enemy, or the next cast due.', specs: ['Disruptor · faster interrupt', 'Executioner · harder interrupts'] },
  medic: { name: 'Iona', role: 'Chirurgeon', mark: '✚', hp: 95, damage: 6, speed: 11, ability: 'Field Mend', help: 'Heal the whole company.', specs: ['Physician · stronger heals', 'Herbalist · faster healing'] },
  hunter: { name: 'Vale', role: 'Hexhunter', mark: '➶', hp: 89, damage: 12, speed: 10, ability: 'Deadeye', help: 'Pierce a ward or a bodyguard with a heavy shot.', specs: ['Marksman · stronger shots', 'Pathfinder · faster shots'] },
  queen: { name: 'The Ash Queen', role: 'Legendary recruit', mark: '♛', hp: 102, damage: 10, speed: 10, ability: 'Ember Court', help: 'Ward the weakest ally. The first fallen ally returns as an echo once per encounter.', specs: ['Pale Court · sturdier echo', 'Red Court · stronger echo'] },
};

export const FOES = {
  guard: { name: 'Cinder Bailiff', mark: '⬟', role: 'Bodyguard', hp: 107, damage: 7, cost: 2, move: 'Iron Sentence', effect: 'slam' },
  healer: { name: 'Tithe Witch', mark: '☽', role: 'Healer', hp: 83, damage: 4, cost: 2, move: 'Blood Tithe', effect: 'heal' },
  hound: { name: 'Kiln Hound', mark: '◆', role: 'Flanker', hp: 78, damage: 7, cost: 1, move: 'Hamstring', effect: 'lunge' },
  seer: { name: 'Soot Seer', mark: '✷', role: 'Fast caster', hp: 92, damage: 5, cost: 2, move: 'Flash Hex', effect: 'hex' },
  boss: { name: 'Prior Veyr', mark: '♜', role: 'Keeper of the Kiln', hp: 265, damage: 10, cost: 4, move: 'Kiln Verdict', effect: 'blast' },
};

// Per-item unconditional probabilities. A single draw can yield at most one pool item.
// These values, the shared guarantee and the separate trophy roll are playtest settings.
export const LOOT = {
  chance: [0.015, 0.03, 0.055],
  guarantee: 12,
  credit: [1, 2, 3],
  trophyChance: [0.04, 0.07, 0.10],
  duplicateDust: 8,
  milestoneDust: { 1: 4, 3: 12 },
  named: {
    queen: { name: 'The Ash Queen', type: 'Recruit', mark: '♛', description: 'Summons an echo of the first fallen ally each encounter. Keep her alive to sustain a fragile damage dealer.' },
    bell: { name: 'The Oathbreaker Bell', type: 'Relic', mark: '♢', description: 'Equip it and bring Rook. Interrupts shatter every enemy barrier and expose the interrupted target to +50% damage for 5 seconds.' },
    saint: { name: 'The Gutter Saint', type: 'Companion', mark: '✟', description: 'Once per encounter, catches a lethal hit and restores that ally to 30% health. Buys time for a risky squad or a late heal.' },
  },
};

export const TIERS = [
  { name: 'I · Ash Road', hp: 1, damage: 1, budget: [3, 4, 6], hazards: ['none'], coins: 40 },
  { name: 'II · Ember Toll', hp: 1.12, damage: 1.22, budget: [4, 5, 7], hazards: ['grates', 'none'], coins: 57 },
  { name: 'III · Black Kiln', hp: 1.24, damage: 1.42, budget: [5, 6, 8], hazards: ['grates', 'smoke'], coins: 76 },
];

export const MODIFIERS = {
  guard: { name: 'Oathbound', description: 'A Bailiff protects the rear line and redirects most attacks. Break the guard or pierce it.' },
  quick: { name: 'Flash Rite', description: 'Soot Seers complete their hexes in 1.5 seconds. Keep Cut Cast ready.' },
  ward: { name: 'Kiln-Warded', description: 'Enemies open with barriers. Deadeye pierces them.' },
  blood: { name: 'Red Tithe', description: 'Tithe Witches restore more health. Focus them early or interrupt Blood Tithe.' },
};

export const HAZARDS = {
  none: { name: 'Still ground' },
  grates: { name: 'Flare grates', effect: 'grates', move: 'Flare Grates' },
  smoke: { name: 'Choking ash', effect: 'smoke', move: 'Choking Ash' },
};

export const PERKS = {
  keen: { name: 'Honed Steel', description: 'Company strikes deal 20% more damage.' },
  tonic: { name: 'Crimson Tonic', description: 'Heal the living company by 32% now.' },
  resolve: { name: 'Iron Resolve', description: 'Take 23% less damage for the rest of the run.' },
  haste: { name: 'Quick Hands', description: 'Abilities cool down 25% faster.' },
  ash: { name: 'Ash Salve', description: 'Revive a fallen ally at half health, or heal the company by 18%.' },
};

export const FORMATIONS = [
  ['guard', 'hound'], ['healer', 'hound'], ['seer', 'hound'],
  ['guard', 'healer'], ['guard', 'seer'], ['seer', 'healer'],
  ['guard', 'healer', 'hound'], ['seer', 'healer', 'hound'],
  ['guard', 'seer', 'hound'], ['guard', 'seer', 'healer'],
];
