import { REGION, HEROES, FOES, TIERS, MODIFIERS, HAZARDS, PERKS, LOOT } from './data.mjs';
import { readBackup } from './backup.mjs';
import {
  STEP, OFFLINE_INTERVAL, contract, newSave, level, gearPrice, hqPrice, offlineCoins, upgrade,
  startRun, availablePerks, nextEncounter, focused, bodyguard, selectTarget, activate, tick, settle,
} from './game.mjs';

const KEY = 'relic-company.save.v1';
const UPDATE_KEY = 'relic-company.auto-update';
const CHECK_INTERVAL = 10 * 60_000;
const screen = document.querySelector('#screen');
const nav = document.querySelector('#nav');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const menus = { contracts: ['⚑', 'Contracts'], company: ['◈', 'Company'], hq: ['⌂', 'HQ'], journal: ['✧', 'Journal'], settings: ['⚙', 'Settings'] };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const code = () => crypto.randomUUID().slice(0, 8).toUpperCase();
const number = value => Math.ceil(value);
const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 8 }).format;
const pressed = state => 'aria-pressed="' + state + '"';
const disabled = state => state ? 'disabled' : '';
const selected = state => state ? ' selected' : '';
const wallet = save => '<div class="inventory"><span class="chip">◉ ' + save.coins + ' coin</span><span class="chip">⬟ ' + save.iron + ' iron</span><span class="chip">✧ ' + save.dust + ' dust</span></div>';
const action = (id, label, extra = '') => '<button type="button" data-action="' + id + '" ' + extra + '>' + label + '</button>';
const primary = (id, label, extra = '') => action(id, label, 'class="primary" ' + extra);
const heroName = id => HEROES[id].name;
const formation = encounter => encounter.roles.map(role => FOES[role].name).join(' · ');
const roundNames = ['The Ash Road', 'The Toll Gate', 'Veyr’s Kiln'];
const meter = '<div class="meter" aria-hidden="true"><span></span></div>';
const targets = {
  slam: 'Heavy strike against the lead ally', lunge: 'Targets the most wounded ally', hex: 'Heavy hit against the most wounded ally',
  heal: 'Restores health to all enemies', blast: 'Heavy damage to the whole company', grates: 'Fire damage to the whole company',
  smoke: 'Company damage and weaker strikes for 6s', coronation: 'Barriers for Veyr and damage to the company',
};

let save, seed, tier, mode, view, paused;
let lastScreen = '';
let failed = null;
let ready = false;
let controller = false;
let releasing;
let claiming = false;
let installed = matchMedia('(display-mode: standalone)').matches;
let installPrompt;
let forcedDrop = null;
let uiMessage = '';
let clock = 0;
let lag = 0;
let registration;
let autoUpdate = true;
let applyingUpdate = false;
let checkingUpdate = false;
let lastCheck = 0;
let updateMessage = 'Updates download when this build’s host is reachable.';
let backupMessage = '';
const watchedWorkers = new WeakSet();
const buildVersion = document.querySelector('meta[name="relic-build"]').content;

function commit(next = save) {
  if (!controller) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    save = next;
    failed = null;
    errorBox.hidden = true;
    return true;
  } catch {
    failed = next;
    errorBox.innerHTML = 'The local save could not be written. Play is paused.' + action('retry', 'Retry save', 'class="minor"');
    errorBox.hidden = false;
    return false;
  }
}

function drawStatus() {
  status.textContent = installed && ready ? 'INSTALLED · OFFLINE READY'
    : ready ? 'OFFLINE READY' : 'LOCAL PLAY';
}

function contractPage() {
  const plan = contract(seed, tier, mode, mode === 'ladder' ? save.ladder : 0);
  const modifier = MODIFIERS[plan.modifier];
  const kit = ['bell', 'saint'].filter(id => save.owned.includes(id)).map(id =>
    action('kit:' + id, (save.kit[id] ? '✓ ' : '+ ') + LOOT.named[id].name, pressed(save.kit[id]) + ' class="minor"')).join('');
  return '<div class="banner"><span class="eyebrow">Region 01 · Company charter</span><h1>' + REGION + '</h1><p>Break the toll and put Prior Veyr to rest.</p></div>'
    + '<div class="content">' + wallet(save)
    + '<div class="mode">' + action('mode:campaign', 'Campaign · ' + save.campaign + '/3', pressed(mode === 'campaign'))
    + action('mode:ladder', 'Ladder · Rung ' + (save.ladder + 1), pressed(mode === 'ladder')) + '</div>'
    + '<div class="tiers" aria-label="Difficulty">' + TIERS.map((item, id) => action('tier:' + id,
      item.name.split(' · ')[0] + '<small>' + item.name.split(' · ')[1] + '</small>', pressed(tier === id))).join('') + '</div>'
    + (mode === 'campaign' && tier > save.campaign ? '<small class="gold">Campaign credit follows the road in order. You can scout any tier.</small>' : '')
    + '<div class="intel"><div class="eyebrow">Contract modifier</div><h3>' + modifier.name + '</h3><p>' + modifier.description + '</p>'
    + '<p><strong>Vanguard</strong> · ' + formation(plan.first) + '</p></div>'
    + '<div class="spread"><span class="eyebrow">Field your squad</span><small class="muted">' + save.squad.length + ' / 3</small></div>'
    + '<div class="squad">' + Object.keys(save.roster).map(id => action('squad:' + id, '<span class="sigil">' + HEROES[id].mark
      + '</span><span><b>' + heroName(id) + (save.squad[0] === id ? ' <span class="position">LEAD</span>' : '')
      + '</b><small class="muted">' + HEROES[id].role + ' · L' + level(save.roster[id].xp) + '</small></span>',
      pressed(save.squad.includes(id)))).join('') + '</div>'
    + (kit ? '<div class="stack"><span class="eyebrow">Legendary kit</span><div class="row">' + kit + '</div></div>' : '')
    + primary('start', 'Draw steel', disabled(save.squad.length !== 3))
    + '<form id="seed-form" class="seed"><label><span class="eyebrow">Contract seed · tap Set to apply</span><input id="seed" maxlength="32" autocomplete="off" spellcheck="false" value="' + escape(seed) + '"></label>'
    + '<button class="minor" type="submit">Set</button>' + action('newseed', 'Reroll', 'class="minor"') + '</form>'
    + (uiMessage ? '<small class="gold" role="status">' + uiMessage + '</small>' : '')
    + (installPrompt ? action('install', 'Install Relic Company', 'class="minor"') : '')
    + '<small class="muted">The lead takes most strikes. Tap enemies to focus attacks, then watch cast bars to time interrupts and defence. Survivors recover 24% health at camp.</small></div>';
}

function companyPage() {
  return '<div class="content"><div class="eyebrow">The roster</div><h1>Company</h1>' + wallet(save)
    + Object.entries(save.roster).map(([id, profile]) => {
      const hero = HEROES[id];
      const rank = level(profile.xp);
      const price = gearPrice(profile.gear);
      return '<article class="card stack"><div class="spread"><h3><span class="sigil">' + hero.mark + '</span> ' + hero.name
        + '</h3><span class="chip">Level ' + rank + '</span></div><small class="muted">' + hero.role
        + ' · ' + (rank === 10 ? 'Max level' : (profile.xp % 30) + '/30 XP to next level') + '</small><p><strong>' + hero.ability
        + '</strong> · ' + hero.help + '</p><small class="gold">SPECIALISATION ' + (rank < 2 ? '· UNLOCKS AT LEVEL 2' : '') + '</small>'
        + (rank < 2 ? '' : hero.specs.map((spec, index) => action('spec:' + id + ':' + index, spec, pressed(profile.spec === index))).join(''))
        + '<small class="gold">REGULAR GEAR · RANK ' + profile.gear + '/3</small>'
        + (profile.gear === 3 ? '<small>Fully upgraded</small>' : action('gear:' + id,
          (profile.gear === 0 ? 'Craft field kit' : 'Upgrade field kit') + ' · ' + price.coins + ' coin + ' + price.iron + ' iron',
          disabled(save.coins < price.coins || save.iron < price.iron))) + '</article>';
    }).join('') + '</div>';
}

function headquartersPage() {
  const price = hqPrice(save.hq);
  const coins = offlineCoins(save);
  return '<div class="content"><div class="eyebrow">Between campaigns</div><h1>Headquarters</h1>' + wallet(save)
    + '<section class="card stack"><div class="spread"><h3>The Armoury</h3><span class="chip">Rank ' + save.hq + '/3</span></div>'
    + '<p>Every rank gives the entire roster +8 maximum health and +1 strike damage.</p>'
    + (save.hq === 3 ? '<small>Fully upgraded</small>' : action('hq', 'Upgrade HQ · ' + price.coins + ' coin + ' + price.iron + ' iron',
      disabled(save.coins < price.coins || save.iron < price.iron))) + '</section>'
    + '<section class="card stack"><h3>Lookout duty</h3><p>Send the reserve on an optional contract. It earns one coin every 5 minutes up to 24 coins, even while the app is closed.</p>'
    + (save.offline.started === null ? action('offline:start', 'Post a lookout')
      : '<small class="gold" id="offline-coins">' + coins + ' coin ready</small>' + action('offline:claim', 'Collect coins', disabled(!coins)))
    + '</section><section class="card"><h3>March records</h3><p>' + save.runs + ' runs · ' + save.wins
    + ' clears · ' + save.campaign + '/3 campaign marks · ' + save.ladder + ' ladder rungs</p></section></div>';
}

function journalPage() {
  const odds = LOOT.chance.map((chance, index) => '<span class="chip">' + (index + 1) + ' · ' + percent(chance) + '</span>').join('');
  return '<div class="content"><div class="eyebrow">Named spoils of the March</div><h1>Journal</h1>' + wallet(save)
    + '<section class="intel"><div class="spread"><h3>Relic commission</h3><span class="chip">' + save.guarantee + ' / ' + LOOT.guarantee
    + '</span></div><p>Every clear earns ' + LOOT.credit.join(' / ') + ' marks by tier. Changing your target keeps your marks. A separate random draw can award one legendary on any clear.</p></section>'
    + Object.entries(LOOT.named).map(([id, item]) => '<article class="card stack' + (save.owned.includes(id) ? ' loot' : '')
      + '"><h3><span class="sigil">' + item.mark + '</span> ' + item.name + '</h3><small class="gold">' + item.type + ' · '
      + (save.owned.includes(id) ? 'Discovered' : 'Undiscovered') + '</small><p>' + item.description + '</p><div class="inventory">' + odds
      + '</div>' + action('target:' + id, save.target === id ? '✓ Commission target' : 'Set commission target', pressed(save.target === id)) + '</article>').join('')
    + '<section class="card stack"><h3>Collection milestones</h3>' + Object.entries(LOOT.milestoneDust).map(([count, dust]) =>
      '<small>' + (save.milestones.includes(Number(count)) ? '✓' : '○') + ' ' + count + ' distinct · ' + dust + ' dust</small>').join('')
    + '<p>Duplicates yield ' + LOOT.duplicateDust + ' dust.</p></section><section class="card"><h3>Kiln Pennants · ' + save.trophy
    + '</h3><p>Separate cosmetic trophy roll · ' + LOOT.trophyChance.map(percent).join(' / ')
    + ' by tier.</p></section></div>';
}

function combatPage(run) {
  return '<section class="battle"><div class="battle-meta spread"><div><div class="eyebrow">Encounter ' + (run.index + 1)
    + ' / 3 · ' + escape(run.plan.seed) + '</div><h3>' + roundNames[run.index] + '</h3><p class="muted">'
    + HAZARDS[run.encounter.hazard].name + ' · ' + MODIFIERS[run.plan.modifier].name + '</p></div>'
    + action('pause', 'Pause', 'class="pause"') + '</div><div class="arena"><div class="crests" aria-hidden="true">'
    + run.enemies.map(foe => action('focus:' + foe.id, '<i>' + FOES[foe.key].mark + '</i><small>' + FOES[foe.key].role
      + '</small>', 'class="crest crest-target" id="crest-' + foe.id + '" tabindex="-1"')).join('')
    + '</div><div class="crests company-line" aria-hidden="true">'
    + run.party.map(ally => '<div class="crest" id="crest-' + ally.key + '"><i>' + HEROES[ally.key].mark + '</i><small>'
      + heroName(ally.key) + '</small></div>').join('') + '</div></div>'
    + '<div class="battle-controls"><div class="telegraph" id="telegraph"><div class="spread"><span class="eyebrow" id="cast-type"></span>'
    + '<span class="health" id="cast-time"></span></div><strong id="cast-title"></strong><small id="cast-hint"></small>' + meter + '</div>'
    + '<div class="enemies" aria-label="Enemy targets">' + run.enemies.map(foe => action('focus:' + foe.id,
      '<strong>' + FOES[foe.key].name + '</strong><span class="role"></span>' + meter + '<span class="health"></span>',
      'id="enemy-' + foe.id + '" class="slot enemy"')).join('') + '</div>'
    + '<div class="party" aria-label="Company abilities">' + run.party.map(ally => '<div class="slot card" id="ally-' + ally.key + '"><strong>'
      + '<span class="sigil">' + HEROES[ally.key].mark + '</span> ' + heroName(ally.key) + '</strong>' + meter
      + '<span class="health"></span>' + action('ability:' + ally.key, HEROES[ally.key].ability,
        'class="ability" title="' + HEROES[ally.key].help + '"') + '</div>').join('') + '</div></div></section>';
}

function drawCombat(run) {
  const focus = focused(run);
  const cast = run.cast;
  const telegraph = document.querySelector('#telegraph');
  const notice = run.time - run.notice.at < 2.2 ? run.notice : null;
  const castRemaining = cast ? Math.max(0, cast.end - run.time) : 0;
  telegraph.classList.toggle('danger', !!cast);
  document.querySelector('#cast-type').textContent = cast ? (cast.id < 0 ? 'Hazard · brace' : 'Enemy casting · interrupt') : 'Combat log';
  document.querySelector('#cast-time').textContent = cast ? castRemaining.toFixed(1) + 's' : run.time.toFixed(0) + 's';
  const title = document.querySelector('#cast-title');
  title.textContent = cast ? cast.name : notice?.text || 'Steel drawn';
  title.className = cast ? '' : notice?.kind || '';
  document.querySelector('#cast-hint').textContent = cast ? targets[cast.effect] : run.guard > 0 ? 'Company braced' : 'Tap an enemy to focus attacks';
  telegraph.style.setProperty('--fill', (cast ? castRemaining / cast.duration * 100 : 0) + '%');
  for (const foe of run.enemies) {
    const button = document.querySelector('#enemy-' + foe.id);
    const icon = document.querySelector('#crest-' + foe.id);
    const isFocused = focus?.id === foe.id;
    button.setAttribute('aria-pressed', isFocused);
    button.disabled = foe.hp <= 0;
    icon.disabled = button.disabled;
    icon.classList.toggle('selected', isFocused);
    icon.classList.toggle('dead', foe.hp <= 0);
    icon.classList.toggle('casting', cast?.id === foe.id);
    button.querySelector('.role').textContent = foe.hp <= 0 ? 'Fallen' : cast?.id === foe.id ? 'Casting'
      : foe.exposed > 0 ? 'Exposed' : bodyguard(run, foe) ? 'Protected' : foe.barrier > 0 ? 'Ward ' + number(foe.barrier) : FOES[foe.key].role;
    button.querySelector('.health').textContent = number(foe.hp) + ' / ' + foe.maxHp;
    button.style.setProperty('--fill', foe.hp / foe.maxHp * 100 + '%');
  }
  for (const ally of run.party) {
    const card = document.querySelector('#ally-' + ally.key);
    const icon = document.querySelector('#crest-' + ally.key);
    const button = card.querySelector('button');
    const hero = HEROES[ally.key];
    const canCut = cast && cast.id >= 0;
    button.disabled = ally.hp <= 0 || ally.echo || ally.cd > 0 || (ally.key === 'duelist' && !canCut);
    button.classList.toggle('react', !button.disabled && !!cast && ['warden', 'duelist'].includes(ally.key));
    icon.classList.toggle('dead', ally.hp <= 0);
    icon.classList.toggle('echo', ally.echo);
    icon.classList.toggle('striking', ally.hp > 0 && run.nextStrike - run.time >= 1.85);
    button.textContent = ally.hp <= 0 ? 'Fallen' : ally.echo ? 'Echo' : ally.cd > 0 ? hero.ability + ' · ' + number(ally.cd) : hero.ability;
    card.querySelector('.health').textContent = number(ally.hp) + ' / ' + ally.maxHp + (ally.ward > 0 ? ' ◈' : '');
    card.style.setProperty('--fill', ally.hp / ally.maxHp * 100 + '%');
  }
}

function interludePage(run) {
  const pending = run.pending;
  return '<div class="banner"><span class="eyebrow">Encounter ' + (run.index + 1) + ' cleared</span><h1>At the fire</h1><p>Choose one boon before you march.</p></div>'
    + '<div class="content"><div class="inventory">' + run.party.map(ally => '<span class="chip">' + heroName(ally.key) + ' · '
      + (ally.echo ? 'Echo' : ally.hp > 0 ? number(ally.hp) + ' HP' : 'Fallen') + '</span>').join('') + '</div><div class="choices">'
    + availablePerks(run).map(id => action('perk:' + id, '<strong>' + PERKS[id].name + '</strong><small>'
      + PERKS[id].description + '</small>', 'class="choice" ' + pressed(pending.perk === id))).join('') + '</div>'
    + (run.index === 0 ? '<div class="eyebrow">Choose a crossing</div><div class="choices">' + ['safe', 'elite'].map(id => action('path:' + id,
      '<strong>' + (id === 'safe' ? 'Lower crossing' : 'Take the tollhouse · bonus loot') + '</strong><small>'
      + formation(run.plan[id]) + ' · ' + HAZARDS[run.plan[id].hazard].name + (id === 'elite' ? ' · Hardened foes' : '') + '</small>',
      'class="choice" ' + pressed(pending.path === id))).join('') + '</div>'
      : '<div class="intel"><span class="eyebrow">Next encounter</span><h3>Veyr’s Kiln</h3><p>' + formation(run.plan.final)
        + ' · ' + HAZARDS[run.plan.final.hazard].name + '</p></div>')
    + primary('march', run.index === 0 ? 'March on' : 'Enter the kiln', disabled(!pending.perk || (run.index === 0 && !pending.path)))
    + '<small class="muted">This camp is saved. You can close the app and return here.</small></div>';
}

function resultsPage(result) {
  return '<div class="banner"><span class="eyebrow">' + TIERS[result.tier].name + ' · ' + escape(result.seed) + '</span><h1>'
    + (result.won ? 'The kiln falls' : 'The company returns') + '</h1><p>' + (result.won ? 'Prior Veyr defeated.'
      : result.cause === 'retreat' ? 'The company withdrew.' : 'The contract was lost.') + ' ' + result.completed + ' / 3 encounters cleared.</p></div>'
    + '<div class="content results"><div class="spread"><h2>Company payout</h2><span class="chip good">✓ Saved</span></div><div class="payout">'
    + '<div class="card"><b>+' + result.coins + '</b><small>Coin</small></div><div class="card"><b>+' + result.iron
    + '</b><small>Iron</small></div><div class="card"><b>+' + result.xp + '</b><small>XP each</small></div></div>'
    + (result.eliteCleared ? '<small class="gold">Tollhouse cleared · bonus pay included</small>' : '')
    + result.ranks.map(item => '<small class="good">↑ ' + heroName(item.key) + ' reached level ' + item.rank + '</small>').join('')
    + result.named.map(item => '<article class="card loot"><div class="eyebrow">' + item.source + '</div><h3>'
      + LOOT.named[item.id].name + '</h3><p>' + (item.duplicate ? 'Duplicate · +' + LOOT.duplicateDust + ' dust' : LOOT.named[item.id].description) + '</p></article>').join('')
    + (result.milestone ? '<small class="good">Collection milestone · +' + LOOT.milestoneDust[result.milestone] + ' dust</small>' : '')
    + (result.trophy ? '<article class="card"><h3>Kiln Pennant</h3><p>A cosmetic trophy was added to the journal.</p></article>' : '')
    + (result.credit ? '<small class="muted">+' + result.credit + ' commission mark' + (result.credit === 1 ? '' : 's') + '</small>' : '')
    + primary('return', 'Find another contract') + action('roster', 'Review the company', 'class="minor"') + '</div>';
}

function settingsPage() {
  return '<div class="content"><div class="eyebrow">On this device</div><h1>Settings</h1>'
    + '<section class="card stack"><div class="spread"><h3>Game updates</h3><span class="chip">Build ' + escape(buildVersion)
    + '</span></div><p>With automatic updates on, the game checks while it’s open and applies downloads between contracts. Your save stays on this device.</p>'
    + action('auto-update', autoUpdate ? 'Automatic updates · On' : 'Automatic updates · Off', pressed(autoUpdate))
    + action('check-update', 'Check for updates')
    + action('apply-update', 'Apply downloaded update', 'hidden')
    + '<small class="gold" id="update-message" role="status"></small></section>'
    + '<section class="card stack"><h3>Save backup</h3><p>Export your progress to move it to another device or game address.</p>'
    + action('export-save', 'Export save') + action('import-save', 'Import save')
    + '<input type="file" id="save-file" accept=".json,application/json" hidden>'
    + '<small class="gold" role="status">' + backupMessage + '</small></section></div>';
}

function drawUpdateSettings() {
  const message = screen.querySelector('#update-message');
  if (!message) return;
  message.textContent = updateMessage;
  screen.querySelector('[data-action="check-update"]').disabled = !registration || checkingUpdate || applyingUpdate;
  screen.querySelector('[data-action="apply-update"]').hidden = !registration?.waiting || applyingUpdate;
}

function applyUpdate() {
  if (!registration?.waiting || !navigator.serviceWorker.controller || applyingUpdate ||
      !controller || document.hidden || failed || save.run || save.last) return;
  applyingUpdate = true;
  updateMessage = 'Applying the update…';
  drawUpdateSettings();
  registration.waiting.postMessage('APPLY_UPDATE');
  setTimeout(() => {
    applyingUpdate = false;
    updateMessage = 'The update is ready. Open Settings to try applying it again.';
    drawUpdateSettings();
  }, 10_000);
}

function updateReady() {
  if (!registration.waiting || applyingUpdate) return;
  checkingUpdate = false;
  updateMessage = 'An update is downloaded and ready to apply.';
  if (autoUpdate) applyUpdate();
  drawUpdateSettings();
}

function watchWorker(worker) {
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') {
      checkingUpdate = false;
      if (registration.waiting) updateReady();
      else {
        updateMessage = 'Game files are ready for offline play.';
        drawUpdateSettings();
      }
    } else if (worker.state === 'redundant' && checkingUpdate) {
      checkingUpdate = false;
      updateMessage = 'The update download was incomplete. Check again when online.';
      drawUpdateSettings();
    }
  });
}

async function checkUpdates(manual = false) {
  if (!registration || !controller || document.hidden || applyingUpdate || checkingUpdate) return;
  if (!manual && (!autoUpdate || Date.now() - lastCheck < CHECK_INTERVAL)) return;
  if (registration.waiting) {
    updateReady();
    return;
  }
  checkingUpdate = true;
  lastCheck = Date.now();
  updateMessage = 'Checking for updates…';
  drawUpdateSettings();
  try {
    await registration.update();
    if (registration.waiting) updateReady();
    else if (registration.installing) {
      updateMessage = 'Downloading the update…';
      watchWorker(registration.installing);
    } else {
      checkingUpdate = false;
      updateMessage = 'You’re on the latest build.';
    }
  } catch {
    checkingUpdate = false;
    updateMessage = 'The update server is unavailable. Your offline game is ready.';
  }
  drawUpdateSettings();
}

function exportSave() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relic-company-save.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

screen.addEventListener('change', async event => {
  if (event.target.id !== 'save-file' || !event.target.files.length) return;
  try {
    const file = event.target.files[0];
    if (file.size > 100_000) throw new Error('Backup too large');
    const backup = readBackup(JSON.parse(await file.text()));
    if (!controller || applyingUpdate || failed || save.run || save.last) return;
    if (!window.confirm('Replace this device’s Relic Company progress with this backup?')) {
      event.target.value = '';
      return;
    }
    if (!commit(backup)) return;
    tier = Math.min(save.campaign, 2);
    backupMessage = 'Save imported.';
  } catch {
    backupMessage = 'Choose a Relic Company save exported between contracts.';
  }
  render(true);
});

function render(force = false) {
  if (!save) return;
  drawStatus();
  const run = save.run;
  const state = save.last ? 'results' : run ? paused ? 'pause' : run.stage : view;
  const key = state + (run ? ':' + run.id + ':' + run.index : '');
  if (key !== lastScreen || force) {
    if (lastScreen !== key) window.scrollTo(0, 0);
    lastScreen = key;
    nav.innerHTML = run || save.last ? '' : Object.entries(menus).map(([id, [mark, name]]) =>
      action('view:' + id, '<b aria-hidden="true">' + mark + '</b>' + name, id === view ? 'aria-current="page"' : '')).join('');
    const pages = { contracts: contractPage, company: companyPage, hq: headquartersPage, journal: journalPage, settings: settingsPage };
    if (state === 'combat') screen.innerHTML = combatPage(run);
    else if (state === 'interlude') screen.innerHTML = interludePage(run);
    else if (state === 'results') screen.innerHTML = resultsPage(save.last);
    else if (state === 'pause') screen.innerHTML = '<div class="banner"><span class="eyebrow">Company at rest</span><h1>Paused</h1><p>'
      + roundNames[run.index] + ' · ' + escape(run.plan.seed) + '</p></div><div class="content"><p class="muted">The fight is saved. Resume when you’re ready.</p>'
      + primary('resume', 'Resume fight') + action('retreat', 'Withdraw and take partial pay') + '</div>';
    else screen.innerHTML = pages[state]();
  }
  if (state === 'combat') drawCombat(run);
  if (state === 'settings') drawUpdateSettings();
  if (!run && !save.last && autoUpdate) applyUpdate();
}

function finish(outcome, cause) {
  const options = { cause };
  if (forcedDrop !== null) options.forceDrop = forcedDrop;
  const next = settle(save, outcome, options);
  if (commit(next)) {
    paused = false;
    if (next.last?.won) forcedDrop = null;
    render();
  }
}

function handle(key) {
  const [type, id, extra] = key.split(':');
  if (type === 'retry') {
    if (failed && commit(failed)) {
      if (save.last?.won) forcedDrop = null;
      render(true);
    }
    return;
  }
  if (!controller || !save || failed || applyingUpdate) return;
  if (type === 'install' && installPrompt) {
    installPrompt.prompt();
    return;
  }
  if (save.last) {
    if (type !== 'return' && type !== 'roster') return;
    const last = save.last;
    if (commit({ ...save, last: null })) {
      view = type === 'roster' ? 'company' : 'contracts';
      mode = last.mode;
      tier = last.won && mode === 'campaign' ? Math.min(save.campaign, 2) : last.tier;
      seed = code();
      render();
    }
    return;
  }
  if (save.run) {
    const run = save.run;
    if (type === 'retreat' && paused) { finish('loss', 'retreat'); return; }
    if (type === 'pause' || type === 'resume') {
      paused = type === 'pause';
      clock = 0;
      lag = 0;
    } else if (!paused && type === 'focus') {
      if (!selectTarget(run, Number(id))) return;
    } else if (!paused && type === 'ability') {
      if (!activate(run, id)) return;
    } else if (run.stage === 'interlude' && type === 'perk') run.pending.perk = id;
    else if (run.stage === 'interlude' && type === 'path') run.pending.path = id;
    else if (type === 'march') {
      if (!nextEncounter(run, run.pending?.perk, run.pending?.path)) return;
    } else return;
    if (commit()) render(run.stage === 'interlude');
    return;
  }
  uiMessage = '';
  switch (type) {
    case 'view': view = id; break;
    case 'check-update': checkUpdates(true); return;
    case 'apply-update': applyUpdate(); return;
    case 'auto-update':
      autoUpdate = !autoUpdate;
      try {
        localStorage.setItem(UPDATE_KEY, autoUpdate ? 'on' : 'off');
      } catch {
        autoUpdate = !autoUpdate;
        updateMessage = 'Could not save the update preference.';
      }
      render(true);
      if (autoUpdate) checkUpdates(true);
      return;
    case 'export-save': exportSave(); return;
    case 'import-save': screen.querySelector('#save-file').click(); return;
    case 'mode': mode = id; break;
    case 'tier': tier = Number(id); break;
    case 'squad':
      if (save.squad.includes(id)) save.squad = save.squad.filter(hero => hero !== id);
      else if (save.squad.length < 3) save.squad.push(id);
      else uiMessage = 'Tap a selected mercenary to free a slot.';
      break;
    case 'kit': save.kit[id] = !save.kit[id]; break;
    case 'spec': save.roster[id].spec = Number(extra); break;
    case 'gear': upgrade(save, 'gear', id); break;
    case 'hq': upgrade(save, 'hq'); break;
    case 'target': save.target = id; break;
    case 'offline':
      if (id === 'start' && save.offline.started === null) save.offline.started = Date.now();
      else if (id === 'claim') {
        const now = Date.now();
        const coins = offlineCoins(save, now);
        if (!coins) return;
        save.coins += coins;
        save.offline.started = coins === 24 ? now : save.offline.started + coins * OFFLINE_INTERVAL;
      }
      break;
    case 'newseed': seed = code(); break;
    case 'start': {
      const entry = screen.querySelector('#seed').value.trim();
      if (entry && entry !== seed) {
        seed = entry;
        uiMessage = 'Seed applied. Review the new modifier and squad before drawing steel.';
        render(true);
        return;
      }
      if (!startRun(save, contract(seed, tier, mode, mode === 'ladder' ? save.ladder : 0), crypto.randomUUID())) return;
      paused = false;
      clock = 0;
      lag = 0;
      break;
    }
    default: return;
  }
  if (commit()) render(true);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled) handle(button.dataset.action);
});
screen.addEventListener('submit', event => {
  if (event.target.id !== 'seed-form') return;
  event.preventDefault();
  seed = screen.querySelector('#seed').value.trim() || code();
  uiMessage = 'Contract intel updated.';
  render(true);
});

function frame(now) {
  requestAnimationFrame(frame);
  if (!controller || failed || document.hidden || paused || save.run?.stage !== 'combat') {
    clock = 0;
    lag = 0;
    return;
  }
  if (clock) lag += Math.min(now - clock, STEP * 1000);
  clock = now;
  if (lag < STEP * 1000) return;
  lag -= STEP * 1000;
  const outcome = tick(save.run);
  if (outcome) finish(outcome);
  else if (commit()) render();
}

function hide() {
  if (!controller) return;
  if (save.run?.stage === 'combat') paused = true;
  clock = 0;
  lag = 0;
  if (save.run && !failed) commit();
  if (releasing && !failed) {
    controller = false;
    releasing();
    releasing = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) hide();
  else if (controller) render(true);
  else claim();
  if (!document.hidden) checkUpdates();
});
window.addEventListener('pagehide', hide);
window.addEventListener('pageshow', () => { if (controller) render(true); else claim(); });
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (controller && !save.run && !save.last && view === 'contracts') render(true);
});
window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  if (controller && !save.run && !save.last) render(true);
});

function initialize() {
  try {
    const raw = localStorage.getItem(KEY);
    save = raw ? JSON.parse(raw) : newSave();
    if (save.version !== 1 || !save.roster || !Array.isArray(save.squad)) throw new Error('Invalid save');
    controller = true;
    autoUpdate = localStorage.getItem(UPDATE_KEY) !== 'off';
    if (!seed) {
      seed = code();
      tier = Math.min(save.campaign, 2);
      mode = 'campaign';
      view = 'contracts';
    }
    paused = save.run?.stage === 'combat';
    render(true);
    checkUpdates();
    if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('dev')) {
      import('./dev.mjs').then(({ attach }) => attach({
        snapshot: () => structuredClone(save),
        force: id => { forcedDrop = id; },
        replace: next => { if (commit(next)) { paused = false; render(true); } },
      })).catch(() => {});
    }
    return true;
  } catch {
    controller = false;
    screen.innerHTML = '<div class="content"><h2>Local save unavailable</h2><p>Open the game where browser storage is available. Your existing save has been kept.</p></div>';
    return false;
  }
}

function claim() {
  if (claiming || controller || document.hidden) return;
  if (!navigator.locks) {
    initialize();
    return;
  }
  claiming = true;
  navigator.locks.request(KEY, { ifAvailable: true }, async lock => {
    claiming = false;
    if (document.hidden) return;
    if (!lock) {
      screen.innerHTML = '<div class="content"><h2>The company is already open</h2><p>Close the other Relic Company window, then reload here.</p></div>';
      nav.innerHTML = '';
      return;
    }
    if (initialize()) await new Promise(resolve => { releasing = resolve; });
  });
}

claim();
requestAnimationFrame(frame);
setInterval(() => {
  if (!controller || failed || document.hidden || view !== 'hq' || !screen.querySelector('#offline-coins')) return;
  const coins = offlineCoins(save);
  screen.querySelector('#offline-coins').textContent = coins + ' coin ready';
  screen.querySelector('[data-action="offline:claim"]').disabled = !coins;
}, 1000);

if ('serviceWorker' in navigator) {
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) location.reload();
    controlled = true;
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(workerRegistration => {
    registration = workerRegistration;
    registration.addEventListener('updatefound', () => watchWorker(registration.installing));
    watchWorker(registration.installing);
    if (registration.waiting) updateReady();
    checkUpdates();
    return navigator.serviceWorker.ready;
  }).then(() => {
    ready = true;
    if (!registration.waiting && !checkingUpdate) updateMessage = 'Game files are ready for offline play.';
    drawStatus();
    drawUpdateSettings();
  }).catch(() => {
    updateMessage = 'This address cannot prepare the offline game or check for updates.';
    drawUpdateSettings();
  });
  window.addEventListener('online', () => { lastCheck = 0; checkUpdates(); });
  setInterval(() => checkUpdates(), CHECK_INTERVAL);
}
