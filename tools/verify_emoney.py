"""Verify original hashes, archive coverage, decoded media and public data."""
import json
import struct
from pathlib import Path
from PIL import Image
from extract_emoney import SOURCE,LOCAL,WEB,image
from emoney_resources import cmp,animation
from unpack_emoney import sha,read_archive,write_json
from export_emoney import read_json,raw


def verify():
    inventory=read_json(LOCAL/'inventory.json')
    for row in inventory:
        original=(SOURCE/row['file']).read_bytes()
        assert sha(original)==row['sha256'],row['file']
        assert (LOCAL/'originals'/row['file']).read_bytes()==original,row['file']
    verified=set();totals=dict(archives=0,resources=0,bitmaps=0,animation_frames=0,empty_frames=0,font_glyphs=0)
    palette=bytes(v*4 for v in (SOURCE/'PAL1.TAB').read_bytes())
    for manifest in sorted((LOCAL/'versions').rglob('manifest.json')):
        report=read_json(manifest);version=manifest.parent.relative_to(LOCAL/'versions').as_posix()
        original=(SOURCE/report['source']).read_bytes();header,entries=read_archive(original)
        rebuilt=(manifest.parent/'index.bin').read_bytes()
        decoded=read_json(manifest.parent/'decoded.json')
        assert len(decoded)==len(entries)==673
        for (r,payload),d in zip(entries,decoded):
            assert r['index']==d['index']
            saved=raw(r,version);assert saved==payload
            rebuilt+=saved;totals['resources']+=1
            if r['sha256'] in verified:continue
            verified.add(r['sha256']);out=LOCAL/d['output']
            if d['status']=='bitmap':
                with Image.open(out/'image.png') as im:
                    im.load();assert im.size==(d['width'],d['height'])
                    if r['name'].endswith('.CMP'):
                        w,h,p,a,pal,_=cmp(payload,palette)
                        assert im.convert('RGBA').tobytes()==image(w,h,p,a,pal).tobytes()
                totals['bitmaps']+=1
            elif d['status']=='animation':
                frames,_=animation(payload)
                meta=read_json(out/'frames.json');assert len(meta)==len(frames)
                for i,(x,y,w,h,p,a) in enumerate(frames):
                    assert (meta[i]['x'],meta[i]['y'],meta[i]['width'],meta[i]['height'])==(x,y,w,h)
                    if w and h:
                        with Image.open(out/f'{i:04d}.png') as im:
                            assert im.size==(w,h)
                            assert im.convert('RGBA').tobytes()==image(w,h,p,a,palette).tobytes()
                    else:totals['empty_frames']+=1
                totals['animation_frames']+=len(frames)
            elif d['status']=='indexed_bitmaps':
                files=list(out.glob('*.png'));assert len(files)==d['frames']
                for f in files:
                    with Image.open(f) as im:im.load();assert im.size==(d['width'],d['height'])
            elif d['status']=='text':
                text=(out/'text.txt').read_text('utf-8');assert '\ufffd' not in text
            elif d['status']=='midi_events':
                midi=(out/'music.mid').read_bytes();assert midi[:4]==b'MThd' and midi[14:18]==b'MTrk'
            elif d['status']=='structured_bytes':
                record_path=manifest.parent/'tables'/f"{r['index']:04d}_{r['name']}.json"
                if r['name'].endswith('.FNT'):
                    assert (LOCAL/'fonts'/r['sha256']/'glyphs.json').exists()
                else:
                    table=read_json(record_path);assert bytes.fromhex(table['raw_records_hex'])==payload
        assert rebuilt==original
        totals['archives']+=1
    # A bitmap atlas is only complete if every glyph re-encodes to the original bytes.
    originals={sha(f.read_bytes()):f for f in SOURCE.rglob('*') if f.is_file()}
    for font_manifest in (LOCAL/'fonts').glob('*/glyphs.json'):
        metadata=read_json(font_manifest);data=originals[font_manifest.parent.name].read_bytes()
        rebuilt=bytearray();width,height=metadata['width'],metadata['height']
        for first in range(0,metadata['count'],256):
            with Image.open(font_manifest.parent/f'{first:05d}.png') as atlas:
                for i in range(first,min(first+256,metadata['count'])):
                    x=(i-first)%16*width;y=(i-first)//16*height
                    rebuilt.extend(atlas.crop((x,y,x+width,y+height)).tobytes())
        assert rebuilt==data,font_manifest
        totals['font_glyphs']+=metadata['count']
    web=read_json(WEB/'data.json')
    assert (len(web['units']),len(web['items']),len(web['spells']),len(web['chapters']))==(32,104,69,4)
    assert all(r['name'] for r in web['items'])
    assert sum(r['kind']=='裝備' for r in web['items'])==48
    assert all(r['kind']=='卡片' for r in web['items'] if r.get('image'))
    assert web['units'][0]['name']=='戰士' and web['units'][0]['hp']==20
    assert web['units'][-1]['name']=='邪神' and web['units'][-1]['hp']==8000
    assert next(r for r in web['spells'] if r['name']=='轉移')['mp']==20
    assert all(len(c['heroes'])==4 for c in web['chapters'])
    assert [c['heroes'][0]['level'] for c in web['chapters']]==[1,10,20,30]
    def visit(value):
        if isinstance(value,dict):
            assert not set(value)&{'source','offset','sha256','raw','u8','u32','file'}
            for v in value.values():visit(v)
        elif isinstance(value,list):
            for v in value:visit(v)
        elif isinstance(value,str):
            assert 'local/' not in value and '\ufffd' not in value
            if value.endswith('.png'):assert (WEB/value).is_file(),value
    visit(web)
    for c in web['chapters']:
        with Image.open(WEB/c['map']) as im:assert im.size==(c['width']*64,c['height']*80)
    write_json(LOCAL/'validation/data_checks.json',dict(passed=True,original_files=len(inventory),unique_resources=len(verified),**totals))
    print(json.dumps(dict(passed=True,original_files=len(inventory),unique_resources=len(verified),**totals)))


if __name__=='__main__':verify()
