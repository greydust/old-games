"""Export verified HR game tables and paired-palette graphics for the website."""
from pathlib import Path
import json
import struct
import hashlib
import re
from hr_economy import markets
from hr_quests import export_quests
from hr_resources import decompress, write_bitmap, default_palette, country_map, frames, write_pcx
from unpack_hr import extract, save_json

SOURCE = Path('local/binary/HR')
LOCAL = Path('local/extracted/hr')
DEST = Path('assets/games/hr')


def text(data):
    raw = data.split(b'\0', 1)[0]
    try:
        return raw.decode('cp950').strip(' 　'), False
    except UnicodeDecodeError:
        return raw.decode('cp950', errors='replace').strip(' 　'), True


def word(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def export():
    extract(SOURCE, LOCAL)
    DEST.mkdir(parents=True, exist_ok=True)
    exe = (SOURCE/'MAIN.EXE').read_bytes()
    palette = default_palette(exe)
    # Verify code that reads the 46-byte unit records and their capability fields.
    assert exe[0x14329:0x1432c] == bytes.fromhex('6b db 2e')
    assert exe[0x14344:0x14349] == bytes.fromhex('26 8b 87 1e 00')
    assert exe[0x14356:0x1435b] == bytes.fromhex('26 8b 87 20 00')
    assert exe[0x14367:0x1436c] == bytes.fromhex('26 8b 87 22 00')
    troops = []
    names = ['hp', 'shoot', 'defence', 'maxHp', 'maxShoot', 'maxDefence',
             'trading', 'performance', 'building', 'maxTrading', 'maxPerformance', 'maxBuilding']
    for i in range(85):
        b = exe[0x3cd98+i*46:0x3cd98+(i+1)*46]
        name, uncertain = text(b[:21])
        troops.append(dict(id=i, name=name, nameUnconfirmed=uncertain, appearanceId=b[21],
                           portrait=(i if i < 6 else None),
                           image=f'images/bc32.mrg/{b[21]*3:04d}.png',
                           **dict(zip(names, struct.unpack_from('<12H', b, 22)))))
    items = []
    for i in range(86):
        b = exe[0x3e511+i*45:0x3e511+(i+1)*45]
        name, uncertain = text(b[:21])
        group = '武器' if i < 23 else '防具' if i < 40 else '物品' if i < 62 else '戰車' if i < 70 else '航空機' if i < 78 else '大砲'
        items.append(dict(id=i, name=name, nameUnconfirmed=uncertain, group=group,
                          price=int.from_bytes(b[23:27], 'little'),
                          attack=word(b,35), defence=word(b,37),
                          effect=('體力完全回復' if word(b,31)==99 else f'體力回復 {word(b,31)}') if 40<=i<44 else None,
                          image=(f'images/item.mrg/{word(b,21):04d}.png' if i<62 else None),
                          durability=word(b,33) if 62<=i<78 else None))
        if 52<=i<58:
            items[-1]['effect']=f'公演 +{b[41]}（公演能力大於 0 時）'
        elif 58<=i<60:
            items[-1]['effect']=f'交易 +{b[40]}（交易能力大於 0 時）'
        elif 60<=i<62:
            items[-1]['effect']=f'建築 +{b[42]}（建築能力大於 0 時）'
        elif 44<=i<52:
            items[-1]['effect']='使用不回復體力；仍消耗 1 次'
    armies = []
    for i in range(117):
        address = 0x3891b+i*81 if i<69 else 0x39ef2+(i-69)*81
        b = exe[address:address+81]
        name, uncertain = text(b[:21])
        members = []
        for j in range(11):
            slot = b[26+j*5:31+j*5]
            kind, experience = struct.unpack_from('<bh',slot)
            assert 0<=kind<3
            unit = b[23+kind]
            if unit != 255:
                members.append(dict(unitId=unit,experience=experience))
        armies.append(dict(id=i, name=name, nameUnconfirmed=uncertain, members=members))
    countries = []
    country_text = json.loads((LOCAL/'texts/COUNTRY.json').read_text(encoding='utf-8'))
    for i in range(11):
        name, uncertain = text(exe[0x379ec+i*73:0x379ec+i*73+13])
        countries.append(dict(id=i, name=name, description=country_text[i]['text']))
    locations = []
    descriptions = json.loads((LOCAL/'texts/SP.json').read_text(encoding='utf-8'))
    assert word(exe,0x379ea) == 99
    for i in range(99):
        b = exe[0x352db+i*101:0x352db+(i+1)*101]
        name, uncertain = text(b[:21])
        shops = []
        for j in range(8):
            s = (SOURCE/'SHOPTAB.TBL').read_bytes()[(i*8+j)*25:(i*8+j+1)*25]
            title, bad = text(s[:21])
            if not re.fullmatch(r'商店[０-９0-9]+', title):
                shops.append(dict(name=title, nameUnconfirmed=bad))
        # Description IDs beyond the table are never guessed.
        locations.append(dict(id=i,name=name,nameUnconfirmed=uncertain,shops=shops))
    heroes = []
    leader_names = []
    profiles = []
    for i in range(6):
        b = exe[0x37d0f+i*382:0x37d0f+(i+1)*382]
        name, _ = text(b[21:38])
        group, _ = text(b[:21])
        unit_id=word(b,85)
        assert unit_id==i
        heroes.append(dict(id=i, name=name, group=group, portrait=i,unitId=unit_id))
        leader_names.append(dict(unitId=unit_id,tableName=troops[unit_id]['name'],playerName=name))
        troops[unit_id]['name']=name
    save_json(LOCAL/'analysis/leader-names.json',leader_names)
    gallery = []
    resource_report = []
    event_dialogues = []
    for f in sorted((LOCAL/'entries').glob('*.MRG/*.bin')):
        raw = f.read_bytes()
        if not raw:
            continue
        row = dict(archive=f.parent.name, entry=f.stem)
        try:
            decoded = decompress(raw)
        except ValueError:
            row['status'] = 'uncompressed_or_unconfirmed'
            decoded = raw
        else:
            decoded_path = LOCAL/'decoded'/f.parent.name/f.name
            decoded_path.parent.mkdir(parents=True, exist_ok=True)
            decoded_path.write_bytes(decoded)
            row.update(status='expanded', bytes=len(decoded))
        try:
            image_path = DEST/'images'/f.parent.name.lower()/(f.stem+'.png')
            write_bitmap(decoded,palette,image_path)
            row['status'] = 'image_exported'
        except ValueError:
            pass
        if f.parent.name == 'ESPMES.MRG':
            count,first=struct.unpack_from('<HI',raw)
            offsets=struct.unpack_from('<'+'I'*count,raw,2)
            assert first==2+4*count and all(a<=b for a,b in zip(offsets,offsets[1:]))
            for index,(start,end) in enumerate(zip(offsets,offsets[1:])):
                assert 0<=start<=end<=len(raw)
                value,bad=text(raw[start:end])
                event_dialogues.append(dict(text=value,unconfirmed=bad))
            row.update(status='nested_text_extracted',textEntries=count-1)
        resource_report.append(row)
    save_json(LOCAL/'analysis/resources.json',resource_report)
    for filename in ['ARROW.GRP','COIN.BIN']:
        for i,frame in enumerate(frames((SOURCE/filename).read_bytes())):
            write_bitmap(frame,palette,DEST/'images'/filename.lower()/f'{i:04d}.png')
    for f in SOURCE.glob('*.PCX'):
        write_pcx(f.read_bytes(),DEST/(f.stem.lower()+'.png'))
    write_bitmap(decompress((SOURCE/'GMAP.PXS').read_bytes()),palette,DEST/'world.png')
    maps = []
    for i in range(1,12):
        image_name=f'map{i:02d}.png'
        write_bitmap(country_map((SOURCE/f'MAP{i:02d}.PXZ').read_bytes()),palette,DEST/image_name)
        maps.append(dict(name=countries[i-1]['name'],image=image_name))
    for f in sorted(SOURCE.glob('*.GS')):
        decoded = decompress(f.read_bytes())
        out = LOCAL/'decoded'/(f.name+'.bin')
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_bytes(decoded)
        if f.stem == 'ROLL':
            assert len(decoded)==320*2000//2
            write_bitmap(struct.pack('<HHB',320,2000,0)+decoded,f.with_suffix('.RGB').read_bytes(),DEST/'credits.png')
            continue
        image_name = f.stem.lower()+'.png'
        width,height = write_bitmap(decoded,f.with_suffix('.RGB').read_bytes(),DEST/image_name)
        if f.stem == 'OP10':
            write_bitmap(decoded,f.with_suffix('.RGB').read_bytes(),DEST/'title.png')
        if f.stem in {f'OP{i}' for i in range(6)}:
            profile=(LOCAL/'texts'/(f.stem+'.txt')).read_text(encoding='utf-8')
            lines=[line.strip() for line in profile.splitlines() if line.strip()]
            profiles.append(dict(name=lines[0],text='\n'.join(lines[1:]),image=image_name))
        if f.stem.startswith('ED'):
            gallery.append(dict(image=image_name,width=width,height=height))
    texts = {}
    texts['eventDialogues']=event_dialogues
    for key,file in [('dialogues','SYSTEM'),('rumours','UWASA'),('powerDialogues','POWERMES'),('placeDescriptions','SP')]:
        records=json.loads((LOCAL/'texts'/(file+'.json')).read_text(encoding='utf-8'))
        texts[key]=[dict(text=r['text'],unconfirmed=r['status']!='decoded') for r in records]
    # Preserve every record byte locally, including fields not exposed on the site.
    evidence=dict(exeSha256=hashlib.sha256(exe).hexdigest(), tables=[
        dict(name='units',offset=0x3cd98,stride=46,count=85),
        dict(name='equipment',offset=0x3e511,stride=45,count=86),
        dict(name='armyTemplates',offset=0x3891b,stride=81,count=69),
        dict(name='armies',offset=0x39ef2,stride=81,count=48),
        dict(name='locations',offset=0x352db,stride=101,count=99),
        dict(name='countries',offset=0x379ec,stride=73,count=11),
        dict(name='playerGroups',offset=0x37d0f,stride=382,count=6)])
    save_json(LOCAL/'analysis/tables.json',evidence)
    data=dict(title='高報酬戰將',heroes=heroes,troops=troops,equipment=items,armies=armies,
              countries=countries,locations=locations,profiles=profiles,endings=gallery,maps=maps,**texts)
    data['opening']='\n'.join(line.strip() for line in (LOCAL/'texts/OP.txt').read_text(encoding='utf-8').splitlines()).strip()
    data['formations']=[dict(name=text(exe[0x527f2+i*65:0x527f2+i*65+21])[0],
                            positions=[list(struct.unpack_from('<hh',exe,0x527f2+i*65+21+j*4)) for j in range(11)]) for i in range(16)]
    data['factions']=[dict(name=text(exe[0x3b806+i*37:0x3b806+i*37+21])[0]) for i in range(16)]
    data['goods']=[dict(name=text(exe[0x3f42f+i*25:0x3f42f+i*25+21])[0],price=int.from_bytes(exe[0x3f42f+i*25+21:0x3f42f+(i+1)*25],'little')) for i in range(12)]
    data['markets']=markets(exe,locations)
    data['quests'],quest_evidence=export_quests(event_dialogues)
    save_json(LOCAL/'analysis/quest-dialogues.json',quest_evidence)
    save_json(DEST/'data.json',data)
    print(f'Website data: {len(troops)} units, {len(items)} equipment, {len(armies)} armies, {len(locations)} locations')


if __name__=='__main__':
    export()
