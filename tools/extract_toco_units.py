"""Decode unit templates and promotion tables verified against 16-bit DOS code."""
from pathlib import Path
import json
import struct
from unpack_toco import png, chunk

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT/'local/binary/TOCO'
DEST = ROOT/'assets/games/toco'
ATTRS = ['生命','技法','防禦','智慧','攻擊','反應']

def export_portrait(f, target, palette):
    data=f.read_bytes();w,h,n=struct.unpack_from('<HHH',data)
    stride=(w+7)//8
    assert len(data)==7+stride*h*4*n
    pixels=bytearray(w*h)
    base=7+6*stride*h*4
    for y in range(h):
        for x in range(w):
            pixels[y*w+x]=sum(((data[base+p*stride*h+y*stride+x//8]>>(7-x%8))&1)<<p for p in range(4))
    png(target,w,h,pixels,palette)
    image=target.read_bytes()
    target.write_bytes(image[:93]+chunk(b'tRNS',bytes([0]+[255]*15))+image[93:])

def main():
    exe = (SOURCE/'TOCO.EXE').read_bytes()
    units = [u for u in json.loads((DEST/'data/units.json').read_text(encoding='utf-8')) if not u['placeholder']]
    assert len(units) == 31
    # DS image at 0x2f3a0. Template copying routine at 0x1b7b0:
    # memcpy(out, DS:0x1692 + index * 40, 40).
    assert exe[0x1b7b9:0x1b7bf] == bytes.fromhex('6b c0 28 05 92 16')
    # Promotion choice uses two one-based class IDs at DS:0x2876.
    assert exe[0x24d6e:0x24d73] == bytes.fromhex('80 bf 76 28 00')
    skills = {}
    for i in range(1,37):
        o = 0x2fc46+(i-1)*30
        raw = exe[o:o+30]
        name = raw[:20].split(b'\0')[0].decode('cp950')
        mana, power, cast_range, area = struct.unpack_from('<HHHH', raw, 22)
        skills[i] = dict(id=i,name=name,exe_offset=o,raw_hex=raw.hex(),
            effect_type=raw[20],area_flag=raw[21],mana_cost=mana,base_power=power,
            cast_range=cast_range,area_value=area,
            effect_label={0:'傷害基值',3:'治療基值',4:'痲痺效果值',5:'石化效果值'}.get(raw[20],'效果值'))
    # Combat palettes are not embedded in FTEAM. Use the palette from WOMAN.PIC
    # as an explicit preview fallback, rather than claim the original combat colors.
    palette = (SOURCE/'WOMAN.PIC').read_bytes()[7:55]
    (DEST/'units').mkdir(parents=True,exist_ok=True)
    for i,u in enumerate(units):
        r = exe[0x30a32+i*40:0x30a32+(i+1)*40]
        assert r[0] == u['slot']
        assert r[4] == ['僧侶系','步兵系','射擊系','投擲系','術士系','騎兵系','飛行系'].index(u['group'])
        u['id'] = i+1
        u['promotions'] = [x for x in exe[0x31c16+i*2:0x31c18+i*2] if x]
        u['skills'] = [skills[x] for x in r[28:40] if x]
        coefficients = exe[0x31c54+i*6:0x31c5a+i*6]
        # 0x24ede: HP/MP coefficient*25+15; 0x24f08 attack*3+5;
        # 0x24f20 reaction*3+2. Defense/wisdom copied from zeroed scratch slots.
        bonus = [coefficients[0]*25+15,coefficients[1]*25+15,0,0,coefficients[4]*3+5,coefficients[5]*3+2]
        u['promotion_bonus'] = dict(zip(ATTRS,bonus))
        u['level_growth'] = dict(zip(ATTRS,['7–10','7–10','1–2','1–2','2–3','0']))
        u['template_stats'] = dict(zip(ATTRS,[struct.unpack_from('<H',r,13)[0],struct.unpack_from('<H',r,17)[0],r[22],r[24],r[21],r[23]]))
        u['template_offset'] = 0x30a32+i*40
        u['recruit_cost'] = exe[0x3091a+r[4]*40+27] if u['slot'] == 0 else None
        u['image'] = f'assets/games/toco/units/{i+1}.png'
        u['image_palette'] = 'WOMAN.PIC fallback; combat colors unverified'
        export_portrait(SOURCE/f'GROUP/FTEAM{i+1}.GRP', DEST/'units'/f'{i+1}.png', palette)
    ids={u['id'] for u in units}
    assert all(set(u['promotions'])<=ids for u in units)
    # Recruitment subtracts base-template byte 27, not the experience word at 11.
    assert exe[0x1fd75:0x1fd7f] == bytes.fromhex('8a 87 95 15 b4 00 29 06 e3 20')
    assert exe[0x27f97:0x27f9c] == bytes.fromhex('83 06 e3 20 05')
    r = exe[0x30279:0x302a1]
    assert r == exe[0x308f2:0x3091a] and r[4] == 7
    commander = dict(id=99, name='指揮官', group='指揮官', slot=0,
        promotions=[1,6,11,15,18,24,28], skills=[skills[x] for x in r[28:40] if x],
        recruit_cost=None, protagonist=True, level_growth=units[0]['level_growth'],
        template_stats=dict(zip(ATTRS,[struct.unpack_from('<H',r,13)[0],struct.unpack_from('<H',r,17)[0],r[22],r[24],r[21],r[23]])),
        image='assets/games/toco/units/commander.png')
    export_portrait(SOURCE/'GROUP/FROLE.GRP', DEST/'units/commander.png', palette)
    units.insert(0, commander)
    (DEST/'data/unit-details.json').write_text(json.dumps(units,ensure_ascii=False,indent=2),encoding='utf-8')
    (DEST/'data/skills.json').write_text(json.dumps(list(skills.values()),ensure_ascii=False,indent=2),encoding='utf-8')
    enemy_names=json.loads((DEST/'data/enemy-names.json').read_text(encoding='utf-8'))
    enemies=[]
    for i in range(33):
        r=exe[0x30f0a+i*40:0x30f0a+(i+1)*40]
        enemy=dict(id=i+1,name=enemy_names[i]['name'],name_status=enemy_names[i]['status'],image=f'assets/games/toco/units/enemy-{i+1}.png',
            template_stats=dict(zip(ATTRS,[struct.unpack_from('<H',r,13)[0],struct.unpack_from('<H',r,17)[0],r[22],r[24],r[21],r[23]])),
            skills=[skills[x] for x in r[28:40] if x],template_offset=0x30f0a+i*40)
        export_portrait(SOURCE/f'GROUP/FAGST{i+1}.GRP',DEST/'units'/f'enemy-{i+1}.png',palette)
        enemies.append(enemy)
    (DEST/'data/enemies.json').write_text(json.dumps(enemies,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Exported {len(units)} units, {len(skills)} skills and 31 portraits')

if __name__ == '__main__':
    main()
