"""Export evidence-backed WDRAGON tables and world map for the static website."""
from pathlib import Path
import hashlib
import json
import struct
from unpack_wdragon import decode_rle
from unpack_toco import png
from export_wdragon_title import export as export_title

SOURCE = Path('local/binary/WDRAGON')
DEST = Path('assets/games/wdragon')


def text(data):
    return data.split(b'\0')[0].decode('big5').strip('　 ')


def word(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def export():
    DEST.mkdir(parents=True, exist_ok=True)
    export_title(SOURCE, DEST/'title.png')
    scenario = (SOURCE / 'SINARIO.DAT').read_bytes()
    exe = (SOURCE / 'KI.EXE').read_bytes()
    assert len(scenario) == 4 * 0x56c0
    assert '武術 統率 政治'.encode('big5') in exe
    assert '生產力　上昇率　防災　城兵'.encode('big5') in exe
    roles = [text(exe[0x77a4+i*6:0x77aa+i*6]) for i in range(6)]
    city_types = [text(exe[0x7ff5+i*6:0x7ffb+i*6]) for i in range(5)]
    assert roles == ['－－－', '軍團長', '內政官', '外交官', '俘虜', '君主']
    assert city_types == ['大都市', '中都市', '小都市', '關卡', '戰場']
    # Check the display instructions, not just plausible numerical ranges.
    for address, instruction in [(0x79b6, b'\x8a\x44\x11'), (0x79c6, b'\x8a\x44\x12'),
                                 (0x79d6, b'\x8a\x44\x13'), (0x7707, b'\x8b\x44\x0e'),
                                 (0x7715, b'\x8a\x44\x10'), (0x773b, b'\xb0\x0a'),
                                 (0x793b, b'\x8a\x64\x1d'), (0x7971, b'\x8a\x44\x17'),
                                 (0x7978, b'\xf6\x04\x40'), (0x80db, b'\x8a\x44\x16\x24\x0f'),
                                 (0x8b1f, b'\x3a\x87\x41\x08'), (0x8b37, b'\xfe\x44\x1b')]:
        assert exe[address:address + len(instruction)] == instruction, hex(address)
    chapters = []
    for chapter in range(4):
        base = chapter * 0x56c0
        block = scenario[base:base+0x56c0]
        characters = []
        for i in range(127):
            offset = 0x42c0 + 32 * i
            r = block[offset:offset+32]
            characters.append(dict(id=i, name=text(r[2:8]), alternate_name=text(r[8:14]),
                martial=r[17], leadership=r[18], politics=r[19],
                proficiency_codes=[r[j] >> 4 for j in (14, 15, 16)],
                suicide_on_faction_defeat=bool(r[0] & 0x10),
                city_combat_proficiency=r[14] >> 4,
                land_combat_proficiency=r[15] >> 4,
                sea_combat_proficiency=r[16] >> 4,
                role=roles[5 if r[23] == 0 and r[0] & 0x40 else r[23]],
                captor_code=r[29], appearance_delay=r[24], preferred_faction_code=r[25],
                faction_code=r[28], status_raw=r[0], active=bool(r[0] & 0x80),
                source_offset=base+offset, raw_hex=r.hex()))
        cities = []
        for i in range(192):
            offset = 0x8c0 + 32 * i
            r = block[offset:offset+32]
            officer = r[25]
            cities.append(dict(id=i, name=text(r[2:8]), x=word(r, 8), y=word(r, 10),
                production=word(r, 14), production_limit=word(r, 12), growth=r[16]-100, disaster_prevention=r[17],
                garrison=r[19]*10, garrison_limit=r[18]*10, administrator_id=officer if officer < 127 else None,
                administrator=characters[officer]['name'] if officer < 127 else None,
                type=city_types[r[22] & 15],
                faction_code=r[1], previous_faction_code=r[26],
                foreign_neighbor_count=r[27], neighbors=[n for n in r[28:32] if n != 255],
                source_offset=base+offset, raw_hex=r.hex()))
        assert all(c['x'] < 384 and c['y'] < 256 for c in cities)
        factions = []
        for i in range(22):
            r = block[128+i*64:192+i*64]
            if r[0] < 128:
                continue
            assert r[1] < 127 and r[3] < 192
            factions.append(dict(id=i, name=characters[r[1]]['name'], ruler_id=r[1],
                strategist_id=r[2] if r[2] < 127 else None,
                strategist=characters[r[2]]['name'] if r[2] < 127 else None,
                capital_id=r[3], capital=cities[r[3]]['name'],
                funds=int.from_bytes(r[32:35], 'little', signed=True), funds_limit=655000,
                cavalry_reserve=word(r,4)*10, archer_reserve=word(r,6)*10, infantry_reserve=word(r,8)*10,
                character_count=r[24], city_count=r[35]))
        faction_names = {f['id']: f['name'] for f in factions}
        for character in characters:
            faction = character['captor_code'] if character['captor_code'] != 255 else character['faction_code']
            character['faction'] = faction_names.get(faction, '中立' if faction == 24 else '無所屬')
            character['preferred_faction'] = faction_names.get(character['preferred_faction_code'])
        for city in cities:
            city['faction'] = faction_names.get(city['faction_code'])
            assert city['production'] <= city['production_limit'] and city['garrison'] <= city['garrison_limit']
            assert all(0 <= n < 192 for n in city['neighbors'])
            assert city['foreign_neighbor_count'] == sum(cities[n]['faction_code'] != city['faction_code'] for n in city['neighbors'])
            for slot, neighbor in enumerate(bytes.fromhex(city['raw_hex'])[28:32]):
                assert bool(bytes.fromhex(city['raw_hex'])[0] & (1 << slot)) == (neighbor != 255 and cities[neighbor]['faction_code'] != city['faction_code'])
            city['neighbor_names'] = [cities[n]['name'] for n in city['neighbors']]
        chapters.append(dict(id=chapter, title=text(block[64:128]), characters=characters, cities=cities, factions=factions))

    # Each tile is 16x16, four consecutive 32-byte bitplanes, MSB first.
    tile_data = (SOURCE / 'MMAP.MDL').read_bytes()
    tile_map = decode_rle((SOURCE / 'MMAP.MAP').read_bytes())
    assert len(tile_data) == 256*128 and len(tile_map) == 384*256
    tiles = []
    for tile in range(256):
        pixels = bytearray(256)
        for y in range(16):
            for x in range(16):
                pixels[y*16+x] = sum(((tile_data[tile*128+plane*32+y*2+x//8] >>
                                       (7-x%8)) & 1) << plane for plane in range(4))
        tiles.append(pixels)
    raw_palette = (SOURCE / 'GAMEPAL.BRG').read_bytes()[:48]
    palette = bytes(raw_palette[color*3+channel]*17 for color in range(16) for channel in (1, 2, 0))
    # Full-size image retains every source pixel; preview uses a smaller sampled map.
    for scale, name in [(16, 'world.png'), (4, 'world-preview.png')]:
        width, height = 384*scale, 256*scale
        pixels = bytearray(width*height)
        for y in range(256):
            for x in range(384):
                tile = tiles[tile_map[y*384+x]]
                for yy in range(scale):
                    start = (y*scale+yy)*width+x*scale
                    pixels[start:start+scale] = tile[(yy*16//scale)*16:(yy*16//scale+1)*16:16//scale]
        png(DEST/name, width, height, pixels, palette)
    matrix = list(exe[0x5320:0x5330])
    assert matrix == [2,3,3,0,3,2,1,0,1,3,2,0,2,1,2,0]
    payload = dict(title='臥龍傳', chapters=chapters,
        troop_names=['騎兵', '弓兵', '步兵'],
        troop_code_mapping_status='unconfirmed',
        combat_weight_matrix=[matrix[i:i+3] for i in (0,4,8,12)],
        map=dict(width=384, height=256, tile_size=16, image='assets/games/wdragon/world.png',
                 preview='assets/games/wdragon/world-preview.png', palette_status='BRG channel order inferred; not verified in running game'),
        sources=[dict(file=f, sha256=hashlib.sha256((SOURCE/f).read_bytes()).hexdigest())
                 for f in ['SINARIO.DAT','KI.EXE','TALK.DAT','MMAP.MAP','MMAP.MDL','GAMEPAL.BRG']])
    evidence = Path('local/extracted/WDRAGON/site-evidence.json')
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    # Keep provenance and undecoded fields out of the website payload.
    for chapter in chapters:
        chapter['characters'] = [{key: record[key] for key in
            ('id', 'name', 'faction', 'role', 'martial', 'leadership', 'politics',
             'city_combat_proficiency', 'land_combat_proficiency', 'sea_combat_proficiency',
             'suicide_on_faction_defeat', 'preferred_faction')} for record in chapter['characters']]
        chapter['cities'] = [{key: record[key] for key in
            ('id', 'name', 'type', 'x', 'y', 'production', 'production_limit', 'growth', 'disaster_prevention',
             'garrison', 'garrison_limit', 'administrator_id', 'administrator', 'faction', 'neighbors', 'neighbor_names')} for record in chapter['cities']]
    for key in ('sources', 'combat_weight_matrix', 'troop_code_mapping_status'):
        payload.pop(key)
    payload['map'].pop('palette_status')
    (DEST/'data.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Exported {len(chapters)} chapters, 508 character records, 768 city records and world map.')


if __name__ == '__main__':
    export()
