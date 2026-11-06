const WIDTH = 9;
const HEIGHT = 11;
const cellAt = (x, y) => y * WIDTH + x;
export const cellX = cell => cell % WIDTH;
export const cellY = cell => Math.floor(cell / WIDTH);
export const distance = (a, b) => Math.abs(cellX(a) - cellX(b)) + Math.abs(cellY(a) - cellY(b));

function neighbors(cell) {
  const x = cellX(cell);
  const y = cellY(cell);
  return [
    y > 0 ? cell - WIDTH : -1, x > 0 ? cell - 1 : -1,
    x < WIDTH - 1 ? cell + 1 : -1, y < HEIGHT - 1 ? cell + WIDTH : -1,
  ];
}

export function makeMap(rng, foeCount) {
  const floor = Array(WIDTH * HEIGHT).fill(false);
  const room = (cx, first, last, halfWidth) => {
    for (let y = first; y <= last; y++) {
      for (let x = cx - halfWidth; x <= cx + halfWidth; x++) floor[cellAt(x, y)] = true;
    }
  };
  const pick = list => list[Math.floor(rng() * list.length)];
  const south = pick([2, 4, 6]);
  const middle = pick([2, 3, 5, 6].filter(x => x !== south));
  const north = pick([2, 4, 6].filter(x => x !== middle));
  room(south, 8, 10, 1);
  room(middle, 4, 7, 1);
  room(north, 1, 3, 2);
  const bridge = (a, b, y) => {
    for (let x = Math.min(a, b) - 1; x <= Math.max(a, b) + 1; x++) {
      floor[cellAt(x, y)] = floor[cellAt(x, y - 1)] = true;
    }
  };
  bridge(south, middle, 8);
  bridge(middle, north, 5);
  room(north, 0, 1, 1);
  for (const row of [2, 3]) floor[cellAt(north + pick([-2, 2]), row)] = false;
  const starts = [cellAt(south, 9), cellAt(south - 1, 10), cellAt(south + 1, 10)];
  const spawns = [cellAt(north, 3), cellAt(north + pick([-1, 1]), 2), cellAt(north, 1)].slice(0, foeCount);
  return { width: WIDTH, height: HEIGHT, floor, starts, spawns, exit: cellAt(north, 0), seen: Array(floor.length).fill(false) };
}

// Returns the next tile on a shortest walkable route, or the origin if unreachable.
export function nextTile(map, from, destination) {
  if (from === destination) return from;
  const frontier = [from];
  const first = Array(map.floor.length).fill(-1);
  first[from] = from;
  for (let i = 0; i < frontier.length; i++) {
    const tile = frontier[i];
    for (const next of neighbors(tile)) {
      if (!map.floor[next] || first[next] !== -1) continue;
      first[next] = tile === from ? next : first[tile];
      if (next === destination) return first[next];
      frontier.push(next);
    }
  }
  return from;
}

export function clearLine(map, from, to) {
  let x = cellX(from);
  let y = cellY(from);
  const tx = cellX(to);
  const ty = cellY(to);
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  let error = dx + dy;
  while (x !== tx || y !== ty) {
    const previousX = x;
    const previousY = y;
    const step = error * 2;
    if (step >= dy) { error += dy; x += Math.sign(tx - x); }
    if (step <= dx) { error += dx; y += Math.sign(ty - y); }
    if (!map.floor[cellAt(x, y)]) return false;
    if (x !== previousX && y !== previousY && !map.floor[cellAt(x, previousY)] && !map.floor[cellAt(previousX, y)]) return false;
  }
  return true;
}

export const inRange = (map, from, to, range) => distance(from, to) <= range && clearLine(map, from, to);

export function nearest(from, units) {
  return units.reduce((best, unit) => !best || distance(from, unit.cell) < distance(from, best.cell) ? unit : best, null);
}
