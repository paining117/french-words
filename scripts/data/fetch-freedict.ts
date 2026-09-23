import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
async function main() {
  const catalogUrl = 'https://freedict.org/freedict-database.json';
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(45000) }); if (!response.ok) throw Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json() as { name: string; releases: { URL: string; version: string; platform: string; checksum: string }[] }[];
  const source = catalog.find(d => d.name === 'fra-zho')?.releases.find(r => r.platform === 'src'); if (!source) throw Error('Official fra-zho source unavailable');
  const directory = resolve('data/raw/freedict/fra-zho'); mkdirSync(directory, { recursive: true });
  const file = join(directory, 'source.tar.xz'); const archive = await fetch(source.URL, { signal: AbortSignal.timeout(60000) }); if (!archive.ok) throw Error(`Archive HTTP ${archive.status}`);
  const bytes = Buffer.from(await archive.arrayBuffer());
  if (createHash('sha512').update(bytes).digest('hex') !== source.checksum) throw Error('FreeDict SHA512 mismatch');
  writeFileSync(file, bytes);
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const names = execFileSync(tar, ['-tf', file], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  if (names.some(n => n.startsWith('/') || n.includes('..') || /^[A-Za-z]:/.test(n))) throw Error('Unsafe archive member');
  execFileSync(tar, ['-xf', file, '-C', directory]);
  writeFileSync('data/raw/freedict/catalog.json', JSON.stringify(catalog));
  writeFileSync(join(directory, 'download.json'), JSON.stringify({ version: source.version, sourceUrl: source.URL, downloadedAt: new Date().toISOString(), sha512: createHash('sha512').update(readFileSync(file)).digest('hex') }, null, 2));
  console.log(`FreeDict ${source.version} downloaded and checksum verified`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
