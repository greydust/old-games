"""Verify HR extraction coverage, site references, and executable formula evidence."""
from pathlib import Path
import hashlib
import json
import struct
import zlib
from hr_economy import trade_price
from hr_resources import decompress, bitmap, country_map

ROOT = Path(__file__).resolve().parents[1]
SOURCE=ROOT/'local/binary/HR'
LOCAL=ROOT/'local/extracted/hr'
DEST=ROOT/'assets/games/hr'


def verify():
    manifest=json.loads((LOCAL/'manifest.json').read_text(encoding='utf-8'))
    for row in manifest:
        raw=(SOURCE/row['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==row['sha256']
        assert (LOCAL/'raw'/row['file']).read_bytes()==raw
        if row['file'].endswith('.MRG'):
            parts=[(LOCAL/'entries'/row['file']/f'{e["index"]:04d}.bin').read_bytes() for e in row['entries']]
            assert b''.join(parts)==raw[row['offsets'][0]:]
    report=json.loads((LOCAL/'analysis/resources.json').read_text(encoding='utf-8'))
    assert len(report)==564
    assert all(r['status'] in ['image_exported','nested_text_extracted'] for r in report)
    for f in SOURCE.glob('*.PXZ'):
        w,h,pixels,_=bitmap(country_map(f.read_bytes()))
        assert (w,h,len(pixels))==(640,400,256000)
    for f in DEST.rglob('*.png'):
        data=f.read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n'
        pos=8
        while pos<len(data):
            n=struct.unpack_from('>I',data,pos)[0];chunk=data[pos+4:pos+8+n]
            assert zlib.crc32(chunk)==struct.unpack_from('>I',data,pos+8+n)[0],f
            pos+=n+12
        assert pos==len(data)
    game=json.loads((DEST/'data.json').read_text(encoding='utf-8'))
    assert len(game['troops'])==85 and len(game['equipment'])==86
    assert len(game['heroes'])==6 and len(game['armies'])==117
    assert len(game['eventDialogues'])==1024
    assert len(game['markets'])==57 and len(game['quests'])==18
    assert trade_price(480,170,0)==(816,652)
    assert trade_price(480,170,20)==(735,717)
    assert trade_price(480,170,100)==(408,408)
    assert trade_price(40,25,162)==(2,2)
    assert trade_price(40,25,200)==(1,1)
    price_checks=0
    for market in game['markets']:
        assert market['name'] in [r['name'] for r in game['locations']]
        assert len(market['goods'])==12
        for i,row in enumerate(market['goods']):
            assert row['goodId']==i and row['multiplier']>0
            for trading in [0,1,20,50,99,100,137,162]:
                buy,sell=trade_price(game['goods'][i]['price'],row['multiplier'],trading)
                assert 1<=sell<=buy
                price_checks+=1
    quest_evidence=json.loads((LOCAL/'analysis/quest-dialogues.json').read_text(encoding='utf-8'))
    for quest,evidence in zip(game['quests'],quest_evidence):
        assert quest['name']==evidence['name']
        assert quest['dialogue']==[game['eventDialogues'][i] for i in evidence['records']]
    assert all('待確認' not in item['effect'] for item in game['equipment'][40:62])
    assert game['armies'][0]['members'][0]['unitId']==29
    assert game['armies'][69]['name']=='普羅魯夫特分遣隊１'
    for army in game['armies']:
        assert army['name'].strip()
        assert all(0<=m['unitId']<85 for m in army['members'])
    assert [u['portrait'] for u in game['troops'][:6]] == [0,1,2,3,4,5]
    assert [h['portrait'] for h in game['heroes']] == list(range(6))
    assert [h['unitId'] for h in game['heroes']] == list(range(6))
    assert all(game['troops'][h['unitId']]['name']==h['name'] for h in game['heroes'])
    assert game['troops'][game['heroes'][2]['unitId']]['trading']==12
    assert game['troops'][game['heroes'][4]['unitId']]['performance']==12
    assert all(u['portrait'] is None for u in game['troops'][6:])
    for unit in game['troops']:
        assert (DEST/unit['image']).is_file()
        assert unit['image']==f'images/bc32.mrg/{unit["appearanceId"]*3:04d}.png'
        if unit['portrait'] is not None:
            assert (DEST/'images/face.mrg'/f'{unit["portrait"]:04d}.png').is_file()
        assert unit['nameUnconfirmed'] or '\ufffd' not in unit['name']
        for stat in ['Hp','Shoot','Defence','Trading','Performance','Building']:
            key=stat[0].lower()+stat[1:]
            assert unit[key]<=unit['max'+stat]
    for item in game['equipment']:
        if item['image']:assert (DEST/item['image']).is_file()
    for record in game['maps']+game['profiles']+game['endings']:
        assert (DEST/record['image']).is_file()
    # Assertions anchor formulas to specific instructions, including integer truncation,
    # PRNG range, distance jump table, overflow-sensitive multiplication and criticals.
    exe=(SOURCE/'MAIN.EXE').read_bytes()
    patterns={
        0x80e6f:'6b db 19',0x80eb0:'26 8a 87 df 6d',
        0x80ee1:'b1 03',0x80ef7:'68 c8 00',
        0x80f25:'01 46 fc',0x80f45:'3b 46 fc',
        0x80ff3:'6a 00 6a 64',0x81006:'68 c8 00',
        0x81034:'29 46 fc',0x80d00:'33 d2 f7 f3',
        0x6f64b:'9a d1 05 30 00',0x6f653:'8b d0 03 d2 03 d0',
        0x64c73:'26 83 3e a7 03 31',
        0x64e8c:'6a 2a',0x65255:'26 80 3e a6 03 03',
        0x6525f:'26 80 3e a6 03 04',
        0x66014:'26 83 3e a7 03 4e',0x66143:'26 83 3e a7 03 52',
        0x66614:'26 83 3e a7 03 41',0x66626:'26 83 3e 27 00 03',
        0x66630:'26 83 3e 27 00 09',0x66644:'83 7e fe 05',
        0x67972:'26 83 3e a7 03 1a',0x68dc9:'26 83 3e a7 03 4b',
        0x68eca:'6a 01 68 a0 86',0x6a6a8:'68 98 00 68 80 96',
        0x582e:'8b 0e 86 03', 0x584f:'25 ff 7f',
        0x13252:'6a 0c 6a 08', 0x1325d:'f7 6e 06',
        0x13264:'f7 fb',0x1326d:'40',0x13272:'f7 fb',
        0x1331d:'05 01 00',0x14329:'6b db 2e',
        0x14415:'eb 1a',0x14421:'d1 f8',0x14423:'05 64 00',
        0x6f04d:'6a 64 6a 50',0x6f072:'26 f7 6f 0f',
        0x6f092:'26 03 54 17',0x6f096:'42',0x6f09a:'f7 fb',
        0x6f09f:'f7 ea',0x6f0a1:'99',0x6f0aa:'6a 28',
        0x6f0f0:'3d 14 00',0x6f0f9:'68 c8 00 68 96 00',
        0x1521a:'26 83 bf 38 0f 63',0x1523c:'26 01 47 57',
        0x15381:'26 8a 47 1a',0x1538b:'26 8a 47 17',
        0x1e723:'8a 44 01',0x1e72e:'8a 04',0x1e73b:'8a 04',
    }
    assert exe[0x518a4:0x518ac]==b'bc32.mrg'
    for offset,pattern in patterns.items():
        expected=bytes.fromhex(pattern)
        assert exe[offset:offset+len(expected)]==expected,hex(offset)
    assert struct.unpack_from('<H',exe,0x39ef0)[0]==69
    assert struct.unpack_from('<H',exe,0x3ae22)[0]==48
    # No source metadata or local dependencies are shipped as website data.
    forbidden={'offset','end','sha256','source','file','hex','raw'}
    def check(value):
        if isinstance(value,dict):
            assert not forbidden.intersection(value)
            for v in value.values():check(v)
        elif isinstance(value,list):
            for v in value:check(v)
        elif isinstance(value,str):
            assert 'local/' not in value and 'local\\' not in value
    check(game)
    result=dict(filesPreserved=len(manifest),archiveImages=sum(r['status']=='image_exported' for r in report),
                nestedTextResources=10, eventDialogues=1024, pngFiles=len(list(DEST.rglob('*.png'))),
                formulaInstructionChecks=len(patterns),tradePriceCases=price_checks,markets=57,questGroups=18,status='passed')
    (LOCAL/'analysis/verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))


if __name__=='__main__':verify()
