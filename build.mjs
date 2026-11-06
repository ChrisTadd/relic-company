import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function build(output, source = new URL('./', import.meta.url)) {
  const worker = await readFile(new URL('sw.js', source), 'utf8');
  const files = JSON.parse(worker.match(/^const FILES = (\[.+\]);$/m)[1]);
  const assets = new Map(await Promise.all(files.map(async name => [name, await readFile(new URL(name, source))])));
  const digest = createHash('sha256').update(worker);
  for (const [name, contents] of assets) digest.update(name).update('\0').update(contents);
  const version = digest.digest('hex').slice(0, 16);
  assets.set('index.html', Buffer.from(assets.get('index.html').toString().replace('name="relic-build" content="local"', 'name="relic-build" content="' + version + '"')));
  const integrity = Object.fromEntries([...assets].map(([name, contents]) =>
    [name, 'sha256-' + createHash('sha256').update(contents).digest('base64')]));
  const script = worker.replace(/^const BUILD = 'local-v\d+';/m, "const BUILD = '" + version + "';")
    .replace('const INTEGRITY = null;', 'const INTEGRITY = ' + JSON.stringify(integrity) + ';');
  await mkdir(output, { recursive: true });
  await Promise.all([...assets, ['sw.js', script]].map(([name, contents]) => writeFile(join(output, name), contents)));
  return version;
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error('Usage: node build.mjs <output-directory>');
  console.log('Relic Company build ' + await build(process.argv[2]));
}
