"""Extract validated TOCO stage structures; keep unknown field semantics explicit."""
from pathlib import Path
import struct
import json
import csv
import sys

def text(b):
    return b.split(b'\0', 1)[0].decode('cp950', errors='strict')

def records(path, size, prefix):
    if not path.exists():
        return []
    b = path.read_bytes()
    count = struct.unpack_from('<H', b)[0]
    if len(b) != 2 + count * size:
        raise ValueError(f'Unexpected record length: {path}')
    return [dict(index=i, **({'unknown_words': list(struct.unpack_from('<HHH', b, 2+i*size))} if prefix else {}),
                 text=text(b[2+i*size+prefix:2+(i+1)*size])) for i in range(count)]

def export(source, dest):
    dest.mkdir(parents=True, exist_ok=True)
    stages = []
    for f in sorted((source/'MAP').glob('GAME*.DAT'), key=lambda f: (int(''.join(filter(str.isdigit, f.stem))), f.stem)):
        b = f.read_bytes()
        tile_count = b[80]*b[81]*520
        end = 84+tile_count*5
        if len(b) != end+b[82]*13:
            raise ValueError(f'Unexpected map length: {f}')
        tiles = [dict(index=i, words=list(struct.unpack_from('<HH', b, 84+i*5)), byte=b[88+i*5]) for i in range(tile_count)]
        placements = []
        for i in range(b[82]):
            o = end+i*13
            raw = b[o:o+13]
            placements.append(dict(index=i, offset=o, unknown_prefix=list(raw[:2]),
                coordinate_words=list(struct.unpack_from('<HHHH', raw, 2)),
                unknown_byte=raw[10], unknown_word=struct.unpack_from('<H',raw,11)[0], raw_hex=raw.hex()))
        stage = dict(id=f.stem, source=str(f.relative_to(source)), name=text(b[60:80]),
            tileset=text(b[:20]), character_graphics=text(b[20:40]), music=text(b[40:60]),
            block_dimensions=list(b[80:82]), unknown_header_byte=b[83], tile_count=tile_count,
            placements=placements, briefing=records(f.with_suffix('.STG'),100,0),
            dialogue=records(f.with_suffix('.MSG'),106,6), ending=records(f.with_suffix('.END'),106,6))
        stages.append(stage)
        (dest/(f.stem+'.json')).write_text(json.dumps(dict(stage,tiles=tiles),ensure_ascii=False,indent=2),encoding='utf-8')
    exe = (source/'TOCO.EXE').read_bytes()
    marker = '僧侶\0戰鬥僧侶\0'.encode('cp950')
    start = exe.index(marker)
    names = exe[start:].split(b'\0',42)[:42]
    units = []
    groups = ['僧侶系','步兵系','射擊系','投擲系','術士系','騎兵系','飛行系']
    offset = start
    for i, raw in enumerate(names):
        name = raw.decode('cp950')
        units.append(dict(table_index=i,group=groups[i//6],slot=i%6,name=name,
            placeholder=name.endswith('XXXX'),exe_offset=offset))
        offset += len(raw)+1
    (dest/'units.json').write_text(json.dumps(units,ensure_ascii=False,indent=2),encoding='utf-8')
    (dest/'stages.json').write_text(json.dumps(stages,ensure_ascii=False,indent=2),encoding='utf-8')
    with (dest/'stages.csv').open('w',encoding='utf-8-sig',newline='') as out:
        writer=csv.writer(out);writer.writerow(['id','name','tileset','music','placement_count','briefing'])
        for s in stages:
            writer.writerow([s['id'],s['name'],s['tileset'],s['music'],len(s['placements']), '\n'.join(r['text'] for r in s['briefing'])])
    lines=['TOCO extracted data','', '兵種名稱（保留原表順序；不代表已確認與圖像或配置 ID 的對應）：']
    lines += [f"{u['table_index']:02d} {u['group']} / {u['name']}" for u in units if not u['placeholder']]
    for s in stages:
        lines += ['',f"{s['id']} — {s['name']}",f"配置紀錄：{len(s['placements'])}"]
        lines += [r['text'] for r in s['briefing']]
        lines += ['對話：']+[r['text'] for r in s['dialogue']]
    (dest/'overview.txt').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(dict(stages=len(stages),unit_names=sum(not u['placeholder'] for u in units),
        placements=sum(len(s['placements']) for s in stages),dialogue_records=sum(len(s['dialogue']) for s in stages))))

if __name__ == '__main__':
    export(Path(sys.argv[1] if len(sys.argv)>1 else 'local/binary/TOCO'),
           Path(sys.argv[2] if len(sys.argv)>2 else 'local/extracted/TOCO/data'))
