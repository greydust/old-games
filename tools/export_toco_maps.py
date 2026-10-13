from pathlib import Path
import struct,sys,json
sys.path.insert(0,'tools');from unpack_toco import png
src=Path('local/binary/TOCO');out=Path('assets/games/toco/maps');out.mkdir(exist_ok=True)
atlases={};stages=json.loads(Path('assets/games/toco/data/stages.json').read_text(encoding='utf-8'))
manifest={}
for stage in stages:
 name=stage['tileset']
 if name not in atlases:
  b=(src/'MAP'/(name+'.GRP')).read_bytes();w,h,n=struct.unpack_from('<HHH',b);assert (w,h)==(24,24);pal=b[7:55];tiles=[]
  for frame in range(n):
   base=55+frame*288;pix=bytearray(576)
   for y in range(24):
    for x in range(24):pix[y*24+x]=sum(((b[base+p*72+y*3+x//8]>>(7-x%8))&1)<<p for p in range(4))
   tiles.append(bytes(pix))
  atlases[name]=(tiles,pal)
 tiles,pal=atlases[name];b=(src/'MAP'/(stage['id']+'.DAT')).read_bytes();w,h=b[80]*26,b[81]*20;pixels=bytearray(w*h*576)
 for i in range(w*h):
  t=struct.unpack_from('<H',b,84+i*5)[0];assert t<len(tiles),(stage['id'],t,len(tiles))
  for y in range(24):
   offset=((i//w)*24+y)*w*24+(i%w)*24;pixels[offset:offset+24]=tiles[t][y*24:(y+1)*24]
 png(out/(stage['id']+'.png'),w*24,h*24,pixels,pal)
 positions=[]
 for r in stage['placements']:
  x,y=r['coordinate_words'][:2]
  assert 0<=x<w and 0<=y<h
  tile_number=struct.unpack_from('<H',b,86+(y*w+x)*5)[0]&255
  assert tile_number==r['index']+1 or (stage['id']=='GAME27' and r['index'] in [27,28])
  positions.append(dict(number=r['index']+1,x=x,y=y,enemy_id=r['unknown_word'],event_unit=bool(r['unknown_prefix'][1])))
 guard=[]
 deployment=[]
 for i in range(w*h):
  terrain=struct.unpack_from('<H',b,86+i*5)[0]>>12
  flags=struct.unpack_from('<H',b,86+i*5)[0]
  if flags & 0x0f00:
   deployment.append(dict(x=i%w,y=i//w))
  if terrain==12:
   x,y=i%w,i//w
   if not any(abs(g['x']-x)<2 and abs(g['y']-y)<2 for g in guard):guard.append(dict(x=x,y=y))
 manifest[stage['id']]=dict(width=w,height=h,image=f"assets/games/toco/maps/{stage['id']}.png",positions=positions,guard=guard,deployment=deployment)

print('31 maps exported')

(out/'index.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
