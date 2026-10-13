"""Verify the three combat-mode selectors against the original executable."""
from pathlib import Path
import json


def verify():
    code = Path('local/binary/WDRAGON/KI.EXE').read_bytes()[0x200:]
    # Mode: city IDs 0..191, land encounter IDs 192..208, sea IDs >=209.
    checks = {
        0x9a5e: 'a0340d32e43cc07208b4013cd17202b40288264bd3',
        # Read character +(0x0e + combat mode), then use the upper nibble.
        0x9c2f: '2e021e4bd380d7008a6f0ed0edd0edd0edd0ed',
        # Mode 1/2 names are read from this string table by c978..c999.
        0xc978: 'a04bd322c0750e',
        0xc98d: '32e4fec8d1e08bf0d1e003f081c65ed4',
        # City battle stores its city ID and retains the city pointer.
        0x4af3: '2e893e320d8bc72d4008d1e0d1e0d1e02e8826340d',
        # Auto-resolved city and army battles pass mode 0 and 1 respectively.
        0x4ee9: 'b000e84202',
        0x4e6a: 'b001e8c102',
        # Compare the three fields and select logical dialogue 1a9/1aa/1ab.
        0x638f: '8a470e8a670f8a4f10',
        0x63a4: 'b9a9013a470e7407413a470f740141',
        # Personality variants: (logical ID - 406) * 8 + variant + 406.
        0x763: '81f99601721381e99601d1e1d1e1d1e102cc80d50081c19601',
    }
    for address, hex_bytes in checks.items():
        expected = bytes.fromhex(hex_bytes)
        assert code[address:address+len(expected)] == expected, hex(address)
    assert code[0xd45e:0xd46a].decode('big5') == '陸上　海上　'
    talk = Path('local/binary/WDRAGON/TALK.DAT').read_bytes()
    names = ('城塞戰', '野戰', '海戰')
    dialogue_groups = []
    for logical, name in zip((0x1a9, 0x1aa, 0x1ab), names):
        first = (logical - 406) * 8 + 406
        start = int.from_bytes(talk[first*2:first*2+2], 'little')
        end = int.from_bytes(talk[(first+1)*2:(first+1)*2+2], 'little')
        assert name.encode('big5') in talk[start:end]
        dialogue_groups.append({'logical_id': logical, 'first_dialogue': first, 'name': name})
    data = json.loads(Path('assets/games/wdragon/data.json').read_text(encoding='utf-8'))
    raw = Path('local/binary/WDRAGON/SINARIO.DAT').read_bytes()
    fields = ('city_combat_proficiency', 'land_combat_proficiency', 'sea_combat_proficiency')
    samples = []
    for chapter in data['chapters']:
        for character in chapter['characters']:
            start = chapter['id'] * 0x56c0 + 0x42c0 + character['id'] * 32
            values = [raw[start+offset] >> 4 for offset in (14, 15, 16)]
            assert values == [character[field] for field in fields]
            if chapter['id'] == 0 and character['name'] in ('曹操', '周瑜', '諸葛亮', '呂布'):
                samples.append({'name': character['name'], 'values': values})
    report = {'instruction_checks': len(checks), 'records_checked': 508,
              'order': list(names), 'dialogue_groups': dialogue_groups, 'samples': samples}
    dest = Path('local/extracted/WDRAGON/proficiency-verification.json')
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Verified combat-mode selectors and all 508 exported proficiency records.')


if __name__ == '__main__':
    verify()
