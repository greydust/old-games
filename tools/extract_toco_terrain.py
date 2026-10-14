"""Export terrain movement costs and class restrictions from TOCO.EXE."""
from pathlib import Path
import json,struct
from collections import Counter
from unpack_toco import png
ROOT=Path(__file__).resolve().parent.parent
b=(ROOT/'local/binary/TOCO/TOCO.EXE').read_bytes(); d=b[0x2f3a0:]
start=b.index('土地'.encode('cp950'))
names=b[start:].split(b'\0',26)[:26]
groups=['僧侶系','步兵系','射擊系','投擲系','術士系','騎兵系','飛行系','指揮官']
samples = {0: {}, 1: {}}
atlases = {}
for f in sorted((ROOT/'local/binary/TOCO/MAP').glob('GAME*.DAT')):
 data=f.read_bytes(); mode=data[83]; w,h=data[80]*26,data[81]*20
 atlas=data[:20].split(b'\0')[0].decode('ascii')
 if atlas not in atlases: atlases[atlas]=(ROOT/'local/binary/TOCO/MAP'/f'{atlas}.GRP').read_bytes()
 for y in range(0,h-1,2):
  for x in range((y//2)%2,w-1,2):
   records=[struct.unpack_from('<HH',data,84+((y+dy)*w+x+dx)*5) for dy in range(2) for dx in range(2)]
   terrain=records[0][1]>>12
   if all(flags>>12==terrain for tile,flags in records):
    key=(atlas,tuple(tile for tile,flags in records))
    samples[mode].setdefault(terrain,Counter())[key]+=1
# Some marked locations occupy only part of a tactical cell; use their actual tile.
for f in sorted((ROOT/'local/binary/TOCO/MAP').glob('GAME*.DAT')):
 data=f.read_bytes(); mode=data[83]; w,h=data[80]*26,data[81]*20
 atlas=data[:20].split(b'\0')[0].decode('ascii')
 for n in range(w*h):
  tile,flags=struct.unpack_from('<HH',data,84+n*5); terrain=flags>>12
  if terrain not in samples[mode]: samples[mode][terrain]=Counter({(atlas,(tile,)):1})
result=[]
for mode,title in enumerate(['野外','城內']):
 rows=[]
 for i in range(13):
  ground,flying=struct.unpack_from('<HH',d,(0xfdc if mode==0 else 0x1010)+i*4)
  mask=d[0x1044+i*2+mode]
  blocked=[name for j,name in enumerate(groups) if not mask & (0x20 if j==7 else 0x40>>j)]
  image=None
  if i+1 in samples[mode]:
   (atlas,frames),count=samples[mode][i+1].most_common(1)[0]
   raw=atlases[atlas]; size=48 if len(frames)==4 else 24; pixels=bytearray(size*size)
   for j,frame in enumerate(frames):
    base=55+frame*288
    for y in range(24):
     for x in range(24):
      pixels[(y+(j//2)*24)*size+x+(j%2)*24]=sum(((raw[base+plane*72+y*3+x//8]>>(7-x%8))&1)<<plane for plane in range(4))
   image=f'assets/games/toco/terrain/{mode}-{i+1}.png'
   png(ROOT/image,size,size,pixels,raw[7:55])
  rows.append(dict(image=image,name=names[mode*13+i].decode('cp950'),ground=ground,flying=flying,blocked=blocked))
 result.append(dict(name=title,rows=rows))
(ROOT/'assets/games/toco/data/terrain.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
