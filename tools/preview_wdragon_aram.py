"""Render ARAM map evidence using the game's original tiles and Chinese glyphs."""
from pathlib import Path
import json
from unpack_wdragon import decode_rle
from unpack_toco import png

root = Path('local/binary/WDRAGON')
output = Path('local/extracted/WDRAGON/aram')
tiles = decode_rle((output/'MMAP.MAP').read_bytes())
mdl = (root/'MMAP.MDL').read_bytes()
raw = (root/'GAMEPAL.BRG').read_bytes()[:48]
palette = bytes(raw[c*3+k]*17 for c in range(16) for k in (1,2,0))
left, top, width, height = 40, 50, 304*4, 140*4
pixels = bytearray(width*height)
for y in range(height):
    for x in range(width):
        tile = tiles[(top+y//4)*384+left+x//4]
        xx, yy = x%4*4, y%4*4
        pixels[y*width+x] = sum(((mdl[tile*128+k*32+yy*2+xx//8] >> (7-xx%8)) & 1) << k for k in range(4))
font = (root/'END_S13.DAT').read_bytes()
white = max(range(16), key=lambda i:sum(palette[i*3:i*3+3]))
black = min(range(16), key=lambda i:sum(palette[i*3:i*3+3]))
for city in json.loads((output/'verification.json').read_text(encoding='utf-8'))['activeCities']:
    ox, oy = (city['x']-left)*4-len(city['name'])*8, (city['y']-top)*4-23
    for i, char in enumerate(city['name']):
        high, low = char.encode('big5')
        base = (high-0xa1)*157 if high<0xa4 else (high-0xa4)*157+408 if high<0xc9 else (high-0xc9)*157+5809
        index = base+(low-0x22 if low>0x7e else low)-0x40
        glyph = font[index*30:index*30+30]
        for y in range(15):
            for x in range(16):
                if glyph[y*2+x//8] >> (7-x%8) & 1:
                    px, py = ox+i*16+x, oy+y
                    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                        if 0<=px+dx<width and 0<=py+dy<height:pixels[(py+dy)*width+px+dx]=black
        for y in range(15):
            for x in range(16):
                if glyph[y*2+x//8] >> (7-x%8) & 1:pixels[(oy+y)*width+ox+i*16+x]=white
png(output/'preview.png',width,height,pixels,palette)
