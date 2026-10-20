"""Decode EMONEY resources and prepare self-contained website assets (requires Pillow)."""
from pathlib import Path
from collections import Counter
import io
import json
import re
import shutil
import struct
import wave
from PIL import Image
from emoney_resources import bitmap, cmp, animation
from unpack_emoney import extract, sha, write_json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'local/binary/emoney'
LOCAL = ROOT / 'local/extracted/emoney'
WEB = ROOT / 'assets/games/emoney'


def image(width, height, pixels, alpha, palette):
    im = Image.frombytes('P', (width, height), bytes(pixels))
    im.putpalette(palette)
    im = im.convert('RGBA')
    im.putalpha(Image.frombytes('L', (width, height), bytes(alpha)))
    return im


def text_resource(data):
    data = data.removesuffix(b'\x1a')
    if not data or any(c < 32 and c not in (9, 10, 13) for c in data):
        return None
    try:
        return data.decode('cp950').replace('\r\n', '\n').replace('\r', '\n')
    except UnicodeDecodeError:
        return None


def indexed_images(index, payload, width, height):
    end = 0
    result = []
    for length, offset in struct.iter_unpack('<II', index):
        if offset != end or offset+length > len(payload):
            raise ValueError('Invalid ICO/TYP index')
        if (width,height)==(64,80) and length==width*height:
            pixels,alpha,used=payload[offset:offset+length],b'\xff'*length,length
        else:
            pixels, alpha, used = bitmap(payload[offset:offset+length], width, height)
        if used != length:
            raise ValueError('Unused icon data')
        result.append((pixels, alpha))
        end += length
    if end != len(payload):
        raise ValueError('Unused icon payload')
    return result


def vlq(value):
    result = [value & 127]
    while value >> 7:
        value >>= 7
        result.insert(0, (value & 127) | 128)
    return bytes(result)


def iff(data, start=0, end=None):
    end = len(data) if end is None else end
    while start < end:
        if start+8 > end:
            raise ValueError('Incomplete IFF header')
        tag = data[start:start+4]
        length = int.from_bytes(data[start+4:start+8], 'big')
        stop = start+8+length
        if stop > end:
            raise ValueError('IFF length exceeds parent')
        if tag in (b'FORM', b'CAT ', b'LIST'):
            yield from iff(data, start+12, stop)
        else:
            yield tag, data[start+8:stop]
        start = stop + (length & 1)
    if start != end:
        raise ValueError('IFF padding exceeds parent')


def xmi_midi(data):
    tracks = []
    for tag, content in iff(data):
        if tag != b'EVNT':
            continue
        pos = tick = order = 0
        events = []
        while pos < len(content):
            while pos < len(content) and content[pos] < 128:
                tick += content[pos]
                pos += 1
            if pos == len(content):
                break
            status = content[pos]
            pos += 1
            if status in (0xff, 0xf0, 0xf7):
                subtype = content[pos] if status == 0xff else None
                pos += status == 0xff
                size = 0
                while True:
                    value = content[pos]; pos += 1
                    size = (size << 7) | (value & 127)
                    if value < 128:
                        break
                payload = content[pos:pos+size]; pos += size
                if len(payload) != size:
                    raise ValueError('Truncated MIDI event')
                if status == 0xff and subtype == 0x2f:
                    if content[pos:] not in (b'', b'\0'):
                        raise ValueError('Bytes after XMI end event')
                    break
                event = bytes([status]) + (bytes([subtype]) if subtype is not None else b'') + vlq(size) + payload
            else:
                kind = status >> 4
                if kind not in range(8, 15):
                    raise ValueError('Unexpected XMI status')
                size = 1 if kind in (12, 13) else 2
                payload = content[pos:pos+size]; pos += size
                if len(payload) != size or any(v > 127 for v in payload):
                    raise ValueError('Invalid XMI channel event')
                event = bytes([status]) + payload
                if kind == 9:
                    duration = 0
                    while True:
                        value = content[pos]; pos += 1
                        duration = (duration << 7) | (value & 127)
                        if value < 128:
                            break
                    events.append((tick+duration, order+1, bytes([0x80 | (status & 15), payload[0], 0])))
            events.append((tick, order, event))
            order += 2
        last = 0
        track = bytearray()
        for time, _, event in sorted(events):
            track += vlq(time-last) + event
            last = time
        track += b'\0\xff\x2f\0'
        tracks.append(b'MTrk'+struct.pack('>I', len(track))+track)
    if not tracks:
        raise ValueError('No XMI event track')
    return b'MThd'+struct.pack('>IHHH',6,int(len(tracks)>1),len(tracks),60)+b''.join(tracks)


def sheet(images, path, columns=8):
    width = max(im.width for im in images)
    height = max(im.height for im in images)
    columns = min(columns, len(images))
    out = Image.new('RGBA', (width*columns, height*((len(images)+columns-1)//columns)))
    for i, im in enumerate(images):
        out.paste(im, (i % columns*width, i//columns*height))
    out.save(path)
    return dict(width=width, height=height, columns=columns, count=len(images))


def decode_archive(version, records, palette, cache):
    entries = LOCAL / 'versions' / version / 'entries'
    by_name = {r['name']:r for r in records}
    results = []
    for row in records:
        filename = f"{row['index']:04d}_{row['name']}"
        data = (entries / filename).read_bytes()
        key = row['sha256']
        if key in cache:
            results.append(dict(index=row['index'], **cache[key]))
            continue
        out = LOCAL / 'decoded' / key
        out.mkdir(parents=True, exist_ok=True)
        suffix = Path(row['name']).suffix
        result = dict(kind=suffix[1:].lower(), output=out.relative_to(LOCAL).as_posix())
        if not data:
            result.update(status='empty')
        elif suffix == '.CMP':
            w,h,p,a,pal,embedded = cmp(data,palette)
            image(w,h,p,a,pal).save(out/'image.png')
            result.update(status='bitmap',width=w,height=h,embedded_palette=embedded)
        elif suffix == '.ANJ':
            frames, maximum = animation(data)
            metadata = []
            for i,(x,y,w,h,p,a) in enumerate(frames):
                metadata.append(dict(index=i,x=x,y=y,width=w,height=h))
                if w and h:
                    image(w,h,p,a,palette).save(out/f'{i:04d}.png')
            write_json(out/'frames.json', metadata)
            result.update(status='animation',frames=len(frames),empty_frames=sum(not f[2] for f in frames),maximum=maximum)
        elif suffix in ('.ICO','.TYP'):
            stem = Path(row['name']).stem
            idx = by_name[stem+'.TYP']; pix = by_name[stem+'.ICO']
            idx_data = (entries/f"{idx['index']:04d}_{idx['name']}").read_bytes()
            pix_data = (entries/f"{pix['index']:04d}_{pix['name']}").read_bytes()
            w,h = (48,48) if stem=='ITEM' else (64,100) if stem=='MAND1' else (64,80)
            tiles = indexed_images(idx_data,pix_data,w,h)
            for i,(p,a) in enumerate(tiles):
                image(w,h,p,a,palette).save(out/f'{i:04d}.png')
            result.update(status='indexed_bitmaps',width=w,height=h,frames=len(tiles))
        elif suffix == '.PCX':
            with Image.open(io.BytesIO(data)) as im:
                im.load();im.save(out/'image.png')
                result.update(status='bitmap',width=im.width,height=im.height,embedded_palette=True)
        elif suffix == '.WAV':
            with wave.open(io.BytesIO(data),'rb') as audio:
                frames = audio.readframes(audio.getnframes())
                if len(frames) != audio.getnframes()*audio.getsampwidth()*audio.getnchannels():
                    raise ValueError('Truncated WAVE samples')
                result.update(status='pcm_audio',channels=audio.getnchannels(),sample_rate=audio.getframerate(),samples=audio.getnframes(),sample_width=audio.getsampwidth())
            shutil.copyfile(entries/filename,out/'audio.wav')
        elif suffix == '.XMI':
            (out/'music.mid').write_bytes(xmi_midi(data))
            result.update(status='midi_events')
        else:
            text = text_resource(data)
            if text is not None:
                (out/'text.txt').write_text(text,encoding='utf-8')
                result.update(status='text')
            elif suffix in ('.MAP','.MAT'):
                if len(data)!=8208:
                    raise ValueError('Unexpected map size')
                w,h = struct.unpack_from('<II',data)
                cells = list(struct.unpack_from('<4096H',data,8))
                if not 0<w<=64 or not 0<h<=64:
                    raise ValueError('Invalid map dimensions')
                write_json(out/'grid.json', dict(width=w,height=h,stride=64,cells=cells,trailer=data[8200:].hex()))
                result.update(status='map_grid',width=w,height=h)
            else:
                # Lossless typed views retain every byte, including unassigned fields.
                write_json(out/'structure.json',dict(bytes=len(data),u8=list(data),u32=list(struct.unpack_from('<'+'I'*(len(data)//4),data)),tail=data[len(data)//4*4:].hex()))
                result.update(status='structured_bytes',semantics='partial')
        cache[key] = result
        results.append(dict(index=row['index'], **result))
    write_json(LOCAL/'versions'/version/'decoded.json',results)
    print(version,dict(Counter(r['status'] for r in results)))
    return results


def main():
    extract(SOURCE,LOCAL)
    WEB.mkdir(parents=True,exist_ok=True)
    palette = bytes(v*4 for v in (SOURCE/'PAL1.TAB').read_bytes())
    cache = {}
    for manifest in sorted((LOCAL/'versions').rglob('manifest.json')):
        version = manifest.parent.relative_to(LOCAL/'versions').as_posix()
        report = json.loads(manifest.read_text('utf-8'))
        decoded = decode_archive(version,report['entries'],palette,cache)
        if version=='main':
            main_records, main_decoded = report['entries'],decoded
    resources = {r['name']:dict(r,decoded=d) for r,d in zip(main_records,main_decoded)}
    # External images and the opening animation also belong to the shipped game.
    external = []
    for f in SOURCE.iterdir():
        if f.suffix.upper() in ('.PCX','.PIC'):
            with Image.open(f) as im:
                im.load();out=LOCAL/'external'/f'{f.name}.png';out.parent.mkdir(exist_ok=True)
                im.save(out);external.append(dict(name=f.name,width=im.width,height=im.height,status='bitmap'))
        elif f.suffix.upper()=='.CMP':
            w,h,p,a,pal,embedded=cmp(f.read_bytes(),palette)
            out=LOCAL/'external'/f'{f.name}.png';out.parent.mkdir(exist_ok=True)
            image(w,h,p,a,pal).save(out)
            external.append(dict(name=f.name,width=w,height=h,status='bitmap',embedded_palette=embedded))
    frames,maximum=animation((SOURCE/'SHOW.ANJ').read_bytes())
    out=LOCAL/'external/SHOW.ANJ';out.mkdir(parents=True,exist_ok=True)
    for i,(x,y,w,h,p,a) in enumerate(frames):
        if w and h:image(w,h,p,a,palette).save(out/f'{i:04d}.png')
    write_json(out/'frames.json',[dict(index=i,x=f[0],y=f[1],width=f[2],height=f[3]) for i,f in enumerate(frames)])
    external.append(dict(name='SHOW.ANJ',status='animation',frames=len(frames)))
    write_json(LOCAL/'external/manifest.json',external)
    write_json(LOCAL/'decode_summary.json',dict(unique_resources=len(cache),main=dict(Counter(r['status'] for r in main_decoded)),external=external))
    write_json(LOCAL/'resources.json',resources)
    print('All archives and external PCX/PIC/ANJ processed')


if __name__ == '__main__':
    main()
