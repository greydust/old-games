"""Read-only comparison of the three local WDRAGON distributions."""
from pathlib import Path
import hashlib
import json
from collections import Counter

ROOT = Path('local/binary')
OUT = Path('local/extracted/WDRAGON/versions')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compare(a, b):
    offsets = [i for i in range(min(len(a), len(b))) if a[i] != b[i]]
    return dict(bytes_before=len(a), bytes_after=len(b), differing_shared_bytes=len(offsets),
                before_sha256=sha(a), after_sha256=sha(b),
                changes=[dict(offset=i, before=a[i], after=b[i]) for i in offsets])


def scenario_changes(a, b):
    output = []
    for chapter in range(4):
        base = chapter*0x56c0
        records = []
        for index in range(127):
            offset = base+0x42c0+index*32
            x, y = a[offset:offset+32], b[offset:offset+32]
            if x == y:
                continue
            records.append(dict(id=index, name=x[2:8].decode('big5', errors='replace').strip('　 '),
                changed_fields=[i for i in range(32) if x[i] != y[i]],
                stats_before=list(x[17:20]), stats_after=list(y[17:20]),
                proficiency_before=[v>>4 for v in x[14:17]],
                proficiency_after=[v>>4 for v in y[14:17]]))
        cities = [i for i in range(192) if
            a[base+0x8c0+i*32:base+0x8e0+i*32] != b[base+0x8c0+i*32:base+0x8e0+i*32]]
        output.append(dict(chapter=chapter+1, changed_characters=len(records),
                           changed_cities=cities, characters=records))
    return output


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    original = ROOT/'WDRAGON'
    versions = {'WRJ':ROOT/'WRJ hydeeric2002 ptt/WRJ',
                'Dragon':ROOT/'Dragon hydeeric2002 ptt/dragon'}
    report = {}
    for name, folder in versions.items():
        inventory = []
        for file in sorted(original.iterdir()):
            if not file.is_file():
                continue
            other = folder/file.name
            if not other.exists():
                inventory.append(dict(file=file.name, status='missing'))
                continue
            a, b = file.read_bytes(), other.read_bytes()
            row = dict(file=file.name, status='identical' if a == b else 'different',
                       bytes_before=len(a), bytes_after=len(b), before_sha256=sha(a), after_sha256=sha(b))
            if a != b:
                row['differing_shared_bytes'] = sum(x != y for x, y in zip(a, b))
            inventory.append(row)
        report[name] = dict(inventory=inventory,
            extras=[f.name for f in sorted(folder.iterdir()) if f.is_file() and not (original/f.name).exists()])
    dragon = ROOT/'Dragon hydeeric2002 ptt'
    report['Dragon']['executable'] = compare((original/'KI.EXE').read_bytes(), (versions['Dragon']/'KI.EXE').read_bytes())
    report['Dragon']['scenario_sets'] = []
    for file in sorted(dragon.rglob('SINARIO.DAT')):
        data = file.read_bytes()
        row = dict(file=str(file.relative_to(dragon)), sha256=sha(data),
            titles=[data[i*0x56c0+64:i*0x56c0+128].split(b'\0')[0].decode('big5', errors='replace').strip('　 ') for i in range(4)])
        if '(改)' in str(file.parent):
            unmodified = Path(str(file).replace('(改)', '')).read_bytes()
            row['changes_from_unmodified'] = scenario_changes(unmodified, data)
            row['byte_comparison'] = compare(unmodified, data)
        report['Dragon']['scenario_sets'].append(row)
    wrj = versions['WRJ']
    report['WRJ']['difficulty_variants'] = {f:compare((wrj/'KI.EXE').read_bytes(), (wrj/f).read_bytes())
        for f in ['KI_light.EXE','KI_medium.EXE','KI_hard.EXE']}
    report['WRJ']['scenario_vs_original'] = compare((wrj/'SINARIO_original.DAT').read_bytes(), (wrj/'SINARIO.DAT').read_bytes())
    for file in wrj.glob('*.txt'):
        (OUT/'WRJ-author-notes.txt').write_text(file.read_bytes().decode('cp949'), encoding='utf-8')
    (OUT/'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for name in versions:
        print(name, dict(Counter(r['status'] for r in report[name]['inventory'])))


if __name__ == '__main__':
    main()
