"""Export TOCO planar graphics using only Python's standard library.

Usage: python tools/unpack_toco.py [source] [destination]
Original files are never modified. Palette-less assets use the DOS EGA palette.
"""
from pathlib import Path
import struct
import zlib
import json
import sys
import math

EGA = bytes(v for rgb in [(0,0,0),(0,0,170),(0,170,0),(0,170,170),
    (170,0,0),(170,0,170),(170,85,0),(170,170,170),(85,85,85),
    (85,85,255),(85,255,85),(85,255,255),(255,85,85),(255,85,255),
    (255,255,85),(255,255,255)] for v in rgb)

def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

def png(path, width, height, pixels, palette):
    raw = b''.join(b'\0' + pixels[y*width:(y+1)*width] for y in range(height))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',width,height,8,3,0,0,0))
        + chunk(b'PLTE',palette) + chunk(b'IDAT',zlib.compress(raw)) + chunk(b'IEND',b''))

def export(source, destination):
    report = []
    for f in sorted(source.rglob('*')):
        if not f.is_file():
            continue
        rel = f.relative_to(source)
        row = {'file': str(rel), 'bytes': f.stat().st_size}
        if f.suffix.upper() not in ('.GRP','.PIC'):
            row['status'] = 'not_decoded'
            report.append(row)
            continue
        data = f.read_bytes()
        w,h,n = struct.unpack_from('<HHH',data)
        offset = 55 if data[6] == 1 else 7
        palette = data[7:55] if offset == 55 else EGA
        embedded = offset == 55
        if w and h and n and len(data) == 53 + w*h*4*n:
            w *= 8
            offset, palette, embedded = 53, data[5:53], True
        stride = (w+7)//8
        size = stride*h*4
        if not w or not h or not n or len(data)-offset != size*n:
            row['status'] = 'unknown_graphics_layout'
            report.append(row)
            continue
        # Each frame stores four complete bitplanes, most-significant bit first.
        cols = min(n, max(1, 1024//w))
        rows = math.ceil(n/cols)
        sheet = bytearray(cols*w*rows*h)
        for frame in range(n):
            base = offset+frame*size
            for y in range(h):
                for x in range(w):
                    pos = y*stride+x//8
                    bit = 7-x%8
                    color = sum(((data[base+p*stride*h+pos] >> bit)&1)<<p for p in range(4))
                    sheet[((frame//cols)*h+y)*cols*w+(frame%cols)*w+x] = color
        output = destination / rel.parent / (rel.name+'.png')
        png(output,cols*w,rows*h,sheet,palette)
        row.update(status='exported',width=w,height=h,frames=n,columns=cols,
                   palette='embedded' if embedded else 'fallback_EGA',output=str(output.relative_to(destination)))
        report.append(row)
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    from collections import Counter
    print(dict(Counter(r['status'] for r in report)))

if __name__ == '__main__':
    export(Path(sys.argv[1] if len(sys.argv)>1 else 'local/binary/TOCO'),
           Path(sys.argv[2] if len(sys.argv)>2 else 'local/extracted/TOCO'))
