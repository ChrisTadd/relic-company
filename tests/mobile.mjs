import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { contract, newSave, startRun, nextEncounter, availablePerks } from '../game.mjs';
import { LOOT } from '../data.mjs';
import { build } from '../build.mjs';

const root = new URL('../', import.meta.url);
const profile = await mkdtemp(join(tmpdir(), 'relic-mobile-'));
const updatesOnly = process.argv.includes('--updates');
const live = join(profile, 'live');
const releaseSource = join(profile, 'source');
let initialBuild;
if (updatesOnly) {
  initialBuild = await build(live);
  await mkdir(releaseSource);
  for (const name of await readdir(live)) await copyFile(new URL(name, root), join(releaseSource, name));
}
const browserPath = process.env.RELIC_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server = spawn(process.execPath, ['serve.mjs', '--dev'], {
  cwd: root, env: { ...process.env, RELIC_PORT: '0', ...(updatesOnly ? { RELIC_ASSETS: live } : {}) }, windowsHide: true,
});
const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--disable-extensions', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true });
server.on('error', error => console.error(error));
browser.on('error', error => console.error(error));
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });

async function waitFor(read, label, timeout = 8000) {
  const end = Date.now() + timeout;
  do {
    const value = await read();
    if (value) return value;
    await delay(50);
  } while (Date.now() < end);
  throw new Error('Timed out: ' + label);
}

const json = url => fetch(url).then(response => response.json()).catch(() => null);
const errors = [];
let ws;
try {
  const port = await waitFor(() => serverLog.match(/localhost:(\d+)/)?.[1], 'game server');
  const debug = await waitFor(async () => {
    const file = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    return file.match(/^\d+\n/)?.[0].trim();
  }, 'browser debug port');
  const tabs = await waitFor(() => json('http://127.0.0.1:' + debug + '/json/list'), 'browser launch');
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  function send(method, params = {}) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function read(expression) {
    const answer = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description || expression);
    return answer.result.value;
  }
  const snapshot = () => read('window.relicDev?.snapshot()');
  const store = () => read("JSON.parse(localStorage.getItem('relic-company.save.v1'))");
  const wait = (expression, label = expression) => waitFor(() => read(expression), label);
  const selector = action => '[data-action="' + action + '"]';
  async function touch(query) {
    const point = await read(`(() => {
      const element = document.querySelector(${JSON.stringify(query)});
      if (!element || element.disabled) return null;
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    })()`);
    if (!point) return false;
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(25);
    return true;
  }
  const tap = action => touch(selector(action));
  async function shot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(profile, name + '.png'), Buffer.from(result.data, 'base64'));
  }
  async function setSeed(seed) {
    await read('document.querySelector("#seed").value = ' + JSON.stringify(seed));
    assert.ok(await touch('#seed-form [type="submit"]'));
    return read('document.querySelector(".intel").innerText');
  }
  async function navigate(url) {
    const loaded = await send('Page.navigate', { url });
    assert.equal(loaded.errorText, undefined);
  }
  const url = 'http://localhost:' + port;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 760, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
    platform: 'Android',
  });
  await navigate(url + '/?dev');
  await wait('!!window.relicDev && !!document.querySelector("#seed")', 'contract board and local playtest tools');
  await wait('document.querySelector("#status").textContent.includes("OFFLINE READY")');
  assert.equal(await read('innerWidth'), 390);
  assert.equal(await read('document.documentElement.scrollWidth'), 390);
  if (updatesOnly) await verifyUpdates();
  else await verifyCombat();

  async function verifyUpdates() {
    const buildMeta = 'document.querySelector(\'meta[name="relic-build"]\').content';
    assert.equal(await read(buildMeta), initialBuild);
    const originIndex = await readFile(new URL('index.html', root), 'utf8');
    const publish = async title => {
      await writeFile(join(releaseSource, 'index.html'), originIndex.replace('<title>Relic Company</title>', '<title>' + title + '</title>'));
      return build(live, pathToFileURL(releaseSource + '/'));
    };
    const start = newSave();
    start.coins = 88;
    await read('relicDev.loadScenario(' + JSON.stringify(start) + ')');
    assert.ok(await tap('view:settings'));
    await wait('!!document.querySelector(\'[data-action="auto-update"]\')', 'settings opened');
    assert.ok(await tap('auto-update'));
    assert.equal(await read('localStorage.getItem("relic-company.auto-update")'), 'off');
    const second = await publish('Relic Company · Update two');
    assert.ok(await tap('check-update'));
    await wait('!document.querySelector(\'[data-action="apply-update"]\').hidden', 'manual download staged');
    assert.equal(await read(buildMeta), initialBuild);
    assert.ok(await tap('apply-update'));
    await wait(buildMeta + ' === ' + JSON.stringify(second), 'manual update applied');
    await wait('!!window.relicDev');
    assert.equal((await store()).coins, 88);

    await tap('view:settings');
    await tap('auto-update');
    await tap('view:contracts');
    await tap('start');
    const run = (await store()).run;
    assert.ok(run);
    const third = await publish('Relic Company · Update three');
    await read('window.dispatchEvent(new Event("online"))');
    await wait('navigator.serviceWorker.getRegistration().then(reg => !!reg.waiting)', 'automatic download staged in combat');
    assert.equal(await read(buildMeta), second);
    assert.equal((await store()).run.id, run.id);
    await tap('pause');
    await tap('retreat');
    await wait('!!document.querySelector("[data-action=return]")');
    const payout = (await store()).coins;
    assert.ok(payout > 88);
    assert.equal(await read(buildMeta), second);
    await tap('return');
    await wait(buildMeta + ' === ' + JSON.stringify(third), 'automatic update after results');
    assert.equal((await store()).coins, payout);
    assert.equal((await store()).last, null);

    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await send('Page.reload');
    await wait('!!document.querySelector("[data-action=start]")', 'updated game reopened offline');
    assert.equal(await read(buildMeta), third);
    assert.equal((await store()).coins, payout);
    assert.deepEqual(errors, []);
    console.log('Manual and automatic downloads verified. An update waited through combat and results, preserved the payout and relaunched offline.');
  }

  async function verifyCombat() {
    const intel = new Set();
    for (const seed of ['playtest0', 'playtest3', 'playtest1']) intel.add(await setSeed(seed));
    assert.equal(intel.size, 3);
    const installability = await send('Page.getInstallabilityErrors');
    assert.deepEqual(installability.installabilityErrors, []);
    await read('window.scrollTo(0, 0)');
    await shot('01-contract');
    console.log('Android viewport: installable manifest, offline shell and three distinct contracts');

    await read('relicDev.forceDrop("queen")');
    assert.ok(await tap('start'));
    const startingCell = (await snapshot()).run.party[0].cell;
    assert.ok(await read('document.querySelectorAll(".map-tiles .tile").length === 99'));
    assert.equal(await read('document.querySelectorAll(".foe-token:not([hidden])").length'), 0);
    await wait('relicDev.snapshot().run.party[0].cell !== ' + startingCell, 'autonomous exploration');
    await wait('document.querySelectorAll(".foe-token:not([hidden])").length === 2', 'enemies discovered on the map');
    const mapTarget = (await snapshot()).run.enemies.at(-1);
    assert.ok(await touch('#crest-' + mapTarget.id));
    await wait('relicDev.snapshot().run.party.every(ally => ally.target === ' + mapTarget.id + ')', 'party follows map tap');
    assert.ok(await tap('focus:auto'));
    await wait('relicDev.snapshot().run.focus === null', 'nearest-target orders restored');
    await wait('!!relicDev.snapshot().run?.cast');
    assert.ok(await tap('ability:duelist'));
    await wait('!relicDev.snapshot().run.cast');
    await shot('02-combat');

    const other = await send('Target.createTarget', { url: 'about:blank' });
    try {
      await wait('document.hidden', 'browser tab backgrounded');
      const before = await store();
      await delay(700);
      assert.deepEqual(await store(), before);
      await send('Page.bringToFront');
      await wait('!document.hidden && !!document.querySelector("[data-action=resume]")', 'resume UI');
      assert.equal((await snapshot()).run.id, before.run.id);
      assert.ok(await tap('resume'));
    } finally {
      await send('Target.closeTarget', { targetId: other.targetId });
    }
    console.log('Background tab froze and restored the same fight');

    const end = Date.now() + 150_000;
    while (Date.now() < end) {
      if (await read('document.hidden')) {
        await send('Page.bringToFront');
        await wait('!document.hidden', 'test tab foregrounded');
        await tap('resume');
      }
      const state = await snapshot();
      if (state.last) break;
      const run = state.run;
      if (run.stage === 'interlude') {
        const perk = ['ash', 'tonic', 'resolve', 'keen', 'haste'].find(id => availablePerks(run).includes(id));
        await tap('perk:' + perk);
        if (run.index === 0) await tap('path:safe');
        await tap('march');
      } else {
        const target = run.enemies.find(foe => foe.hp > 0 && foe.key === 'healer');
        if (target && run.focus !== target.id) await tap('focus:' + target.id);
        if (run.cast && run.cast.end - run.time < 0.85 && !await tap('ability:duelist')) await tap('ability:warden');
        if (run.party.some(ally => ally.hp > 0 && ally.hp < ally.maxHp * 0.6)) await tap('ability:medic');
      }
      await delay(120);
    }
    const won = await snapshot();
    assert.ok(won.last?.won);
    assert.equal(won.last.named[0].id, 'queen');
    await shot('03-results');
    await send('Page.reload');
    await wait('!!window.relicDev?.snapshot().last', 'results reopened');
    assert.deepEqual(await snapshot(), won);
    await tap('return');
    await send('Page.reload');
    await wait('!!document.querySelector("[data-action=start]")', 'results acknowledged');
    assert.equal((await store()).coins, won.coins);
    console.log('Full contract played with touch input. Forced first-clear reward persisted exactly once');

    await tap('tier:0');
    const quickSeed = Array.from({ length: 50 }, (_, i) => 'quick-' + i).find(seed => contract(seed, 0).modifier === 'quick');
    await setSeed(quickSeed);
    await tap('start');
    await wait('relicDev.snapshot().run?.cast?.name === "Flash Hex"', 'fast enemy cast');
    assert.equal((await snapshot()).run.cast.duration, 1.5);
    assert.ok(await tap('ability:duelist'));
    await tap('pause');
    await tap('retreat');
    await tap('return');
    await tap('tier:1');
    const guardSeed = Array.from({ length: 50 }, (_, i) => 'guard-' + i).find(seed => {
      const plan = contract(seed, 1);
      return plan.modifier === 'guard' && plan.first.roles.includes('healer');
    });
    await setSeed(guardSeed);
    await tap('start');
    const guardedRun = (await snapshot()).run;
    const witch = guardedRun.enemies.find(foe => foe.key === 'healer');
    await wait('!document.querySelector("#enemy-' + witch.id + '").hidden', 'witch discovered');
    assert.equal(await read('document.querySelector("#enemy-' + witch.id + ' .role").textContent'), 'Protected');
    assert.ok(await touch('#enemy-' + witch.id));
    await wait('relicDev.snapshot().run.party.every(ally => ally.target === ' + witch.id + ')', 'party targets protected healer');
    assert.equal((await snapshot()).run.enemies[witch.id].hp, witch.maxHp);
    await tap('pause');
    await tap('retreat');
    await tap('return');
    console.log('Additional touch-started contracts confirmed fast casts and protected healers');

    const prepare = async state => read('relicDev.loadScenario(' + JSON.stringify(state) + ')');
    const loss = await store();
    startRun(loss, contract('bad-ground', 2), 'loss-fixture');
    loss.run.party.forEach(ally => { ally.hp = 0; });
    await prepare(loss);
    await wait('!!relicDev.snapshot().last', 'lost contract');
    const lost = await snapshot();
    assert.equal(lost.last.won, false);
    assert.ok(lost.coins > loss.coins && lost.iron > loss.iron && lost.roster.warden.xp > loss.roster.warden.xp);
    assert.equal(lost.guarantee, loss.guarantee);
    await tap('return');

    const next = await store();
    next.guarantee = LOOT.guarantee - 1;
    await prepare(next);
    await tap('view:journal');
    await tap('target:bell');
    const commissioned = await store();
    assert.equal(commissioned.guarantee, LOOT.guarantee - 1);
    assert.equal(commissioned.target, 'bell');
    startRun(commissioned, contract('final-blow', 0), 'duplicate-fixture');
    for (let i = 0; i < 2; i++) {
      commissioned.run.stage = 'interlude';
      nextEncounter(commissioned.run, availablePerks(commissioned.run)[0], 'elite');
    }
    commissioned.run.enemies.forEach(foe => { foe.hp = 1; foe.barrier = 0; });
    commissioned.run.party.forEach(ally => { ally.cell = commissioned.run.map.spawns[0]; });
    await read('relicDev.forceDrop("queen")');
    await prepare(commissioned);
    await wait('!!relicDev.snapshot().last', 'guarantee and duplicate');
    const payout = await store();
    assert.equal(payout.last.eliteCleared, true);
    assert.equal(payout.last.named.find(item => item.source === 'Guarantee').id, 'bell');
    assert.equal(payout.last.named.find(item => item.id === 'queen').duplicate, true);
    assert.equal(payout.dust, commissioned.dust + LOOT.duplicateDust);
    console.log('Loss pay, elite pay, commission retargeting and duplicate dust checked in results UI');

    await tap('return');
    await tap('tier:2');
    await tap('start');
    await wait('!!relicDev.snapshot().run?.cast', 'higher-tier telegraph');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
    assert.ok(await read('document.querySelector(".party").getBoundingClientRect().bottom <= innerHeight'));
    assert.equal(await read('document.documentElement.scrollWidth'), 320);
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await send('Page.reload');
    await wait('!!document.querySelector("[data-action=resume]")', 'offline relaunch');
    const restored = await store();
    assert.equal(restored.run.plan.tier, 2);
    assert.ok(restored.run.cast);
    assert.ok(await tap('resume'));
    assert.equal(await read('document.querySelector("#cast-title").textContent'), restored.run.cast.name);
    assert.deepEqual(errors, []);
    console.log('Network disabled: app relaunched into a saved live telegraph');
    console.log('Screenshots saved in ' + profile);
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: 0, method: 'Browser.close' }));
    await delay(100);
  }
  ws?.close();
  browser.kill();
  server.kill();
}
