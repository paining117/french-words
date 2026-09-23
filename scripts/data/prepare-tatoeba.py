"""Build-only helper: official weekly exports, stdlib bz2, no app dependency."""
import bz2
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

root = Path('data/raw/tatoeba')
root.mkdir(parents=True, exist_ok=True)
files = {
    'fra-cmn_links.tsv.bz2': 'fra',
    'fra_sentences_detailed.tsv.bz2': 'fra',
    'cmn_sentences_detailed.tsv.bz2': 'cmn',
}
sources = []
for name, language in files.items():
    url = f'https://downloads.tatoeba.org/exports/per_language/{language}/{name}'
    path = root / name
    if not path.exists():
        with urlopen(url, timeout=50) as response:
            path.write_bytes(response.read())
    sources.append({'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'downloadedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()})
with bz2.open(root / 'fra-cmn_links.tsv.bz2', 'rt', encoding='utf-8') as stream:
    links = [line.rstrip('\n').split('\t') for line in stream]
needed_fr = {pair[0] for pair in links}
needed_zh = {pair[1] for pair in links}
def sentences(language, needed):
    result = {}
    with bz2.open(root / f'{language}_sentences_detailed.tsv.bz2', 'rt', encoding='utf-8') as stream:
        for line in stream:
            fields = line.rstrip('\r\n').split('\t')
            if len(fields) >= 4 and fields[0] in needed and fields[1] == language:
                result[fields[0]] = (fields[2], fields[3] if fields[3] != '\\N' else 'unknown contributor')
    return result
fr, zh = sentences('fra', needed_fr), sentences('cmn', needed_zh)
rows = [(a, fr[a][0], b, zh[b][0], fr[a][1], zh[b][1]) for a, b in links if a in fr and b in zh]
rows.sort(key=lambda row: (int(row[0]), int(row[2])))
(root / 'fra-cmn.tsv').write_text(''.join('\t'.join(row) + '\n' for row in rows), encoding='utf-8')
(root / 'source.json').write_text(json.dumps({
    'sourceUrl': 'https://tatoeba.org/en/downloads',
    'license': 'CC BY 2.0 FR', 'licenseUrl': 'https://creativecommons.org/licenses/by/2.0/fr/',
    'downloadedAt': max(item['downloadedAt'] for item in sources),
    'sources': sources, 'pairs': len(rows),
    'transformation': 'Direct fra-cmn links joined with official detailed sentences; owner names retained; no inferred translations.',
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'directPairs': len(rows), 'sources': sources}, indent=2))
