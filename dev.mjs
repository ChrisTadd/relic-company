import { LOOT } from './data.mjs';

// Loaded only on loopback with ?dev. The next eligible clear uses the forced roll.
export function attach({ snapshot, force, replace }) {
  window.relicDev = Object.freeze({
    snapshot,
    forceDrop(id) {
      if (!Object.hasOwn(LOOT.named, id)) throw new Error('Use queen, bell, or saint');
      force(id);
    },
    // Playtest scenarios and browser automation can load a prepared version 1 save.
    loadScenario(save) {
      if (save.version !== 1) throw new Error('Expected a version 1 playtest save');
      replace(structuredClone(save));
    },
  });
}
