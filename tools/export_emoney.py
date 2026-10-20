"""Build public EMONEY game data, with private provenance kept under local/."""
import json
import re
import shutil
import struct
from pathlib import Path
from PIL import Image, ImageDraw
from extract_emoney import ROOT,SOURCE,LOCAL,WEB,sheet,text_resource,initialized_object
from emoney_tables import structure,monsters,heroes,items,spells,cities,integer,string
from unpack_emoney import write_json,sha


def read_json(path):return json.loads(path.read_text('utf-8'))


def raw(row,version='main'):
    return (LOCAL/'versions'/version/'entries'/f"{row['index']:04d}_{row['name']}").read_bytes()


def resource_image(resource):
    return LOCAL/resource['decoded']['output']/'image.png'


def fonts(data,name,out):
    width,height,stride=(8,15,1) if name.startswith('GAMEASC') else (16,15,2) if name in ('FONT16.FNT','GR16.FNT') else (24,24,3)
    size=height*stride
    if len(data)%size:
        raise ValueError(f'Unaligned font {name}')
    count=len(data)//size
    out.mkdir(parents=True,exist_ok=True)
    for first in range(0,count,256):
        im=Image.new('1',(16*width,16*height))
        for i in range(first,min(first+256,count)):
            glyph=data[i*size:(i+1)*size]
            tile=Image.frombytes('1',(stride*8,height),glyph)
            im.paste(tile,(((i-first)%16)*width,((i-first)//16)*height))
        im.save(out/f'{first:05d}.png')
    write_json(out/'glyphs.json',dict(count=count,width=width,height=height,bytes_per_glyph=size,mapping='unconfirmed'))
    return dict(status='font_bitmap_atlas',glyphs=count,width=width,height=height,mapping='unconfirmed')


def local_structures():
    reports=[]
    for manifest in sorted((LOCAL/'versions').rglob('manifest.json')):
        version=manifest.parent.relative_to(LOCAL/'versions').as_posix()
        for row in read_json(manifest)['entries']:
            data=raw(row,version)
            parsed=structure(row['name'],data)
            out=LOCAL/'versions'/version/'tables'/f"{row['index']:04d}_{row['name']}.json"
            if parsed is not None:
                # Complete byte preservation supports future refinement of unknown fields.
                parsed['raw_records_hex']=data.hex()
                write_json(out,parsed)
                reports.append(dict(version=version,index=row['index'],name=row['name'],status='records_parsed'))
            elif row['name'].endswith('.FNT'):
                result=fonts(data,row['name'],LOCAL/'fonts'/row['sha256'])
                reports.append(dict(version=version,index=row['index'],name=row['name'],**result))
    external=[]
    for f in sorted(SOURCE.rglob('*')):
        if not f.is_file():continue
        rel=f.relative_to(SOURCE)
        data=f.read_bytes()
        copy=LOCAL/'originals'/rel
        copy.parent.mkdir(parents=True,exist_ok=True);copy.write_bytes(data)
        row=dict(name=rel.as_posix(),sha256=sha(data),bytes=len(data))
        if f.parent==SOURCE and (f.suffix.upper()=='.FNT' or f.suffix=='.24'):
            row.update(fonts(data,f.name,LOCAL/'fonts'/sha(data)))
        elif f.suffix.upper()=='.EXE' and f.name=='MONEY.EXE':
            header=struct.unpack_from('<I',data,60)[0]
            if data[header:header+2]!=b'LE':raise ValueError('Expected LE executable')
            ot,count,pt=struct.unpack_from('<III',data,header+64)
            page_size=struct.unpack_from('<I',data,header+40)[0]
            start=struct.unpack_from('<I',data,header+128)[0]
            objects=[]
            for i in range(count):
                size,base,flags,first,pages,_=struct.unpack_from('<6I',data,header+ot+24*i)
                content=bytearray()
                for j in range(first-1,first-1+pages):
                    item=data[header+pt+4*j:header+pt+4*j+4]
                    physical=int.from_bytes(item[:3],'big')
                    if item[3] != 0:raise ValueError('Unsupported LE page type')
                    content.extend(data[start+(physical-1)*page_size:start+physical*page_size])
                dest=LOCAL/'executables'/sha(data);dest.mkdir(parents=True,exist_ok=True)
                (dest/f'object-{i}.bin').write_bytes(content[:size])
                objects.append(dict(index=i,size=size,base=base,flags=flags,pages=pages))
            write_json(dest/'objects.json',objects)
            row.update(status='le_objects_extracted',objects=len(objects))
        elif f.suffix.upper() in ('.SAV',) or f.name in ('IMAGE.IDX','IMAGE.DAT'):
            write_json(LOCAL/'external_structures'/(rel.as_posix()+'.json'),dict(bytes=len(data),u8=list(data),u32=list(struct.unpack_from('<'+'I'*(len(data)//4),data)),tail=data[len(data)//4*4:].hex(),semantics='unconfirmed'))
            row.update(status='user_state_preserved',semantics='unconfirmed')
        else:
            row.update(status='preserved')
        external.append(row)
    write_json(LOCAL/'table_coverage.json',reports)
    write_json(LOCAL/'external_coverage.json',external)


def export_web():
    resources=read_json(LOCAL/'resources.json')
    WEB.mkdir(parents=True,exist_ok=True)
    def publish(name,dest):
        target=WEB/dest;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(resource_image(resources[name]),target)
        return dest
    title=publish('WORD-2.CMP','title.png')
    units=monsters(raw(resources['MONSTER.DAT']))[1:]
    equipment=[r for r in items(raw(resources['ITEM.DAT'])) if r['name'] and r['id']]
    magic=[r for r in spells(raw(resources['SPELL2.DAT'])) if r['name']]
    skills={r['id']:r['name'] for r in magic}
    for r in units:
        r.pop('affinity')
        r['image']=publish(r.pop('sprite')+'.CMP',f"units/{r['id']:02d}.png")
        r['skills']=[skills[i] for i in r['skills']]
    icon_dir=LOCAL/resources['ITEM.ICO']['decoded']['output']
    for r in equipment:
        r.pop('extra');r.pop('allowed')
        # Card resource names encode their ITEM.DAT ID; equipment icon relation is separate.
        name=f"CARD{r['id']:03d}.CMP"
        if r['name'].endswith('卡') and name in resources:
            r['image']=publish(name,f"items/{r['id']:03d}.png")
        r['kind']='卡片' if r['name'].endswith('卡') else '裝備' if 1<=r['type']<=6 else '其他'
    # CARD text is kept verbatim, segmented into names/effects only for browsing.
    descriptions={};group='';active=None
    card_text=text_resource(raw(resources['CARD.DAT']))
    for line in card_text.splitlines():
        line=line.strip()
        if not line:continue
        if '：' in line:
            name,effect=line.split('：',1)
            active=name;descriptions[name]=dict(category=group,effect=effect)
        elif line.endswith('類'):
            group=line;active=None
        elif active:
            descriptions[active]['effect']+='\n'+line
    for r in equipment:
        if r['name'] in descriptions:r.update(descriptions[r['name']])
    chapters=[]
    for chapter in range(1,5):
        prefix=f'MAP{chapter:02d}'
        hero=heroes(raw(resources[prefix+'.CHR']))
        for r in hero:
            # +14 differs between releases; portraits use actor index instead.
            # Retain the field in private tables until all consumers are traced.
            r.pop('profession')
            r['image']=publish(f"FACE{r['id']+1:02d}00.CMP",f"heroes/{r['id']}.png")
            r['troops']=[dict(name=units[t['id']-1]['name'],level=t['level']) for t in r['troops'] if t['id']]
            r['spells']=[dict(name=skills[s],level=lv) for s,lv in zip(r['spells'],r.pop('spellLevels'))]
        grid=raw(resources[prefix+'.MAP'])
        w,h=struct.unpack_from('<II',grid)
        cells=struct.unpack_from('<4096H',grid,8)
        tiles_dir=LOCAL/resources[prefix+'.ICO']['decoded']['output']
        tiles=[Image.open(f).copy() for f in sorted(tiles_dir.glob('*.png'))]
        map_image=Image.new('RGBA',(w*64,h*80))
        for y in range(h):
            for x in range(w):
                tile=cells[y*64+x]
                if tile>=len(tiles):raise ValueError('Map tile ID out of bounds')
                map_image.alpha_composite(tiles[tile],(x*64,y*80))
        map_image.save(LOCAL/'versions/main'/f'map-{chapter}.png')
        (WEB/'maps').mkdir(exist_ok=True)
        map_image.save(WEB/f'maps/{chapter}.png')
        miniature=publish(prefix+'.CMP',f'maps/{chapter}-small.png')
        intro=text_resource(raw(resources[f'MISS0{chapter}.DAT']))
        title_match=re.search(r'第[一二三四]章\s+([^\n]+)',intro)
        cities_data=cities(raw(resources[prefix+'.DAT']))[1:]
        for c in cities_data:
            c['troops']=[dict(name=units[t['id']-1]['name'],level=t['level']) for t in c['troops'] if t['id']]
        chapters.append(dict(id=chapter,name=title_match[0].strip() if title_match else str(chapter),
                             introduction=intro.strip(),heroes=hero,cities=cities_data,
                             map=f'maps/{chapter}.png',miniature=miniature,width=w,height=h,
                             endings=[text_resource(raw(resources[f'MISS{ending}{chapter}.DAT'])).strip() for ending in (1,2)]))
    # All Chinese display strings from the initialized data object, strict decoding only.
    exe=(SOURCE/'MONEY.EXE').read_bytes();dialogue=[];evidence=[]
    pos,initialized=initialized_object(exe)
    for value in initialized.split(b'\0'):
        text=text_resource(value)
        if text and re.search('[\u4e00-\u9fff]',text):
            if not re.search('[\u4e00-\u9fff]',text[:2]) and sum('\u4e00'<=c<='\u9fff' for c in text)<3:
                pos+=len(value)+1;continue
            evidence.append(dict(offset=pos,text=text))
            # Single Han characters can come from numeric tables. Format templates
            # require runtime substitutions and are not public dialogue paragraphs.
            if len(text.strip())>=2 and not re.search(r'%[-+ #0-9.]*[a-zA-Z]',text) and text not in dialogue:
                if text=='山中廢墟中有釵h隱藏的寶藏。':
                    dialogue.append(text+'（文字待確認）')
                else:
                    dialogue.append(text)
        pos+=len(value)+1
    write_json(LOCAL/'analysis/display_strings.json',evidence)
    # Original chapter art, endings and story panels contain game text and images.
    art=[]
    for name in resources:
        if re.fullmatch(r'(STORY\d+|WIN\d+|OVER\d+)\.CMP',name):
            category='劇情' if name.startswith('STORY') else '勝利' if name.startswith('WIN') else '結局'
            index=int(re.search(r'\d+',name)[0])
            art.append(dict(category=category,index=index,image=publish(name,f'art/{category}-{index}.png')))
    write_json(WEB/'data.json',dict(title=title,units=units,items=equipment,spells=magic,chapters=chapters,dialogue=dialogue,art=art))
    write_json(LOCAL/'web_export.json',dict(units=len(units),items=len(equipment),spells=len(magic),chapters=len(chapters),dialogue=len(dialogue),art=len(art)))
    print('Website data:',read_json(LOCAL/'web_export.json'))


if __name__=='__main__':
    local_structures()
    export_web()
