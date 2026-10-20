"""Named EMONEY records; unknown bytes remain in local evidence only."""
import struct


def integer(data, offset):
    return struct.unpack_from('<i',data,offset)[0]


def string(data):
    return data.split(b'\0',1)[0].decode('cp950').strip()


def records(data, size, trailing=0):
    if len(data)%size != trailing:
        raise ValueError(f'Record size mismatch: {len(data)}/{size}')
    return [data[i:i+size] for i in range(0,len(data)-trailing,size)]


MONSTER_FIELDS = dict(level=30,hp=38,hpGrowth=42,mp=50,mpGrowth=54,
                      attack=58,attackGrowth=62,defence=66,defenceGrowth=70,
                      intelligence=74,intelligenceGrowth=78,luck=82,hit=106,
                      evade=110,affinity=142)
HERO_FIELDS = dict(level=23,hp=31,hpGrowth=35,mp=43,mpGrowth=47,
                   strength=51,strengthGrowth=55,dexterity=59,dexterityGrowth=63,
                   intelligence=67,intelligenceGrowth=71,luck=75,hit=83,evade=87,
                   attack=79,defence=91,gold=191)


def monsters(data):
    out=[]
    for i,r in enumerate(records(data,170,1)):
        if integer(r,0)!=i:raise ValueError('Monster ID mismatch')
        out.append(dict(id=i,name=string(r[4:18]),sprite=string(r[18:22]).upper(),
                        **{k:integer(r,o) for k,o in MONSTER_FIELDS.items()},
                        skills=[integer(r,o) for o in (114,118,122) if integer(r,o)]))
    return out


def heroes(data):
    return [dict(id=i,name=string(r[4:14]),**{k:integer(r,o) for k,o in HERO_FIELDS.items()},
                 troops=[dict(id=integer(r,255+j*4),level=integer(r,271+j*4)) for j in range(4)],
                 spells=[r[131+j]+50 for j in range(10) if r[131+j]],
                 spellLevels=[r[141+j] for j in range(10) if r[131+j]])
            for i,r in enumerate(records(data,383))]


def items(data):
    return [dict(id=integer(r,0),name=string(r[4:16]),type=r[16],allowed=r[17],
                 attack=integer(r,18),hit=integer(r,22),defence=integer(r,26),
                 evade=integer(r,30),price=integer(r,34),extra=integer(r,38))
            for r in records(data,42,1)]


def spells(data):
    return [dict(id=integer(r,0),name=string(r[4:16]),type=r[16],target=r[17],
                 range=r[18],animation=r[19],mp=r[20]) for r in records(data,21)]


def cities(data):
    return [dict(id=integer(r,0),name=string(r[4:16]),x=integer(r,16),y=integer(r,20),
                 level=integer(r,24),gold=integer(r,28),type=integer(r,40),wall=r[44],river=r[45],
                 troops=[dict(id=integer(r,50+j*4),level=integer(r,70+j*4)) for j in range(5)])
            for r in records(data,170)]


def structure(name,data):
    if name=='MONSTER.DAT':return dict(records=monsters(data),record_size=170,tail=data[-1:].hex())
    if name=='ITEM.DAT':return dict(records=items(data),record_size=42,tail=data[-1:].hex())
    if name=='SPELL2.DAT':return dict(records=spells(data),record_size=21)
    if name.endswith('.CHR'):return dict(records=heroes(data),record_size=383)
    if name.startswith('MAP') and name.endswith('.DAT'):return dict(records=cities(data),record_size=170)
    if name=='SPELL.DAT':return dict(record_size=20,records=[dict(id=integer(r,0),name=string(r[4:16]),fields=list(r[16:])) for r in records(data,20,1)],tail=data[-1:].hex(),active=False)
    if name=='GROUP.DAT':return dict(record_size=52,records=[dict(id=integer(r,0),name=string(r[4:16]),multipliers=[integer(r,o) for o in range(16,52,4)]) for r in records(data,52,1)],tail=data[-1:].hex(),active_unconfirmed=True)
    if name=='ATTYPE.DAT':return dict(record_size=63,records=[dict(index=i,animation=string(r[:13]),fields=[integer(r,o) for o in range(13,61,4)],flags=list(r[61:])) for i,r in enumerate(records(data,63,1))],tail=data[-1:].hex())
    if name=='ITEMLOC.DAT':return dict(record_size=8,coordinates=[dict(x=x,y=y) for x,y in struct.iter_unpack('<ii',data)])
    if name.endswith('.CHG'):return dict(tile_changes=list(struct.unpack('<'+'I'*(len(data)//4),data)))
    if name=='TRANTAB.DAT':return dict(color_lookup=list(data))
    return None
