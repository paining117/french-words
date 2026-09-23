import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
async function main() {
  const sourceUrl = 'https://cental.uclouvain.be/cefrlex/static/resources/fr/FleLex_TT_Beacco.tsv';
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(45000) }); if (!response.ok) throw Error(`FLELex HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 300).toString().includes('<html')) throw Error('Expected TSV, received HTML');
  mkdirSync('data/raw/flelex', { recursive: true }); writeFileSync('data/raw/flelex/FleLex_TT_Beacco.tsv', bytes);
  writeFileSync('data/raw/flelex/download.json', JSON.stringify({ sourceUrl, variant: 'FLELex / Beacco TreeTagger', downloadedAt: new Date().toISOString(), sha256: createHash('sha256').update(bytes).digest('hex'), license: 'CC BY-NC-SA 4.0' }, null, 2));
  console.log('Official FLELex / Beacco TSV downloaded');
}
main().catch(error => { console.error(error); console.error('Use the official Download page and save FleLex_TT_Beacco.tsv in data/raw/flelex/; never substitute inferred levels.'); process.exitCode = 1; });
