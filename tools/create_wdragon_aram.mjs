import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await import('./wdragon_editor.js');
const {Scenario,WorldMap,syncMap}=globalThis.WdragonEditor;
const game='local/binary/WDRAGON',output='local/extracted/WDRAGON/aram';
const original=new Uint8Array(await readFile(`${game}/SINARIO.DAT`));
const originalMap=new Uint8Array(await readFile(`${game}/MMAP.MAP`));
const model=new Scenario(original),world=new WorldMap(await readFile('assets/games/wdragon/world.map'));
const node=(name,x,y,owner=24,base=false)=>({name,x,y,owner,base});
const nodes=[
  node('漢騎營',110,70,0),node('騎營',192,70),node('魏騎營',274,70,1),
  node('漢主堡',60,115,0,true),node('漢步營',110,115,0),node('步營',192,115),node('魏步營',274,115,1),node('魏主堡',324,115,1,true),
  node('漢弓營',110,160,0),node('弓營',192,160),node('魏弓營',274,160,1)
];
const edges=[[0,1],[1,2],[3,4],[4,5],[5,6],[6,7],[8,9],[9,10],[0,4],[4,8],[1,5],[5,9],[2,6],[6,10]];
const oldNames=Array.from({length:192},(_,id)=>model.name(0,'cities',id));
for(let i=0;nodes.length<192;i++)nodes.push(node(oldNames[nodes.length],3+(i%64)*6,199+Math.floor(i/64)*12));
const adjacency=Array.from({length:192},()=>[]);
for(const [a,b] of edges){adjacency[a].push(b);adjacency[b].push(a);}
world.tiles.fill(182);
const castle=[[222,231,231,231,223],[230,255,254,255,246],[230,254,205,254,246],[230,255,254,255,246],[224,247,247,247,225]];
const camp=[[222,230,223],[230,211,246],[224,247,225]];
for(let id=0;id<nodes.length;id++){
  const n=nodes[id],pattern=n.base?castle:camp,r=n.base?2:1;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)world.set(n.x+dx,n.y+dy,pattern[dy+r][dx+r]);
}
for(const [a,b] of edges){
  const from=nodes[a],to=nodes[b],dx=Math.sign(to.x-from.x),dy=Math.sign(to.y-from.y);
  assert(from.x===to.x || from.y===to.y);
  const ra=from.base?2:1,rb=to.base?2:1;
  const port=(n,r,sx,sy)=>world.set(n.x+r*sx,n.y+r*sy,n.base?(sx?221:220):sx<0?214:sx>0?215:sy<0?212:213);
  port(from,ra,dx,dy);port(to,rb,-dx,-dy);
  for(let x=from.x+dx*(ra+1),y=from.y+dy*(ra+1);x!==to.x-dx*rb || y!==to.y-dy*rb;x+=dx,y+=dy)world.set(x,y,dx?200:201);
}
const sourceCity=model.bytes.slice(model.address(0,'cities',0),model.address(0,'cities',0)+32);
const liu=model.ids(0,'characters').find(id=>model.name(0,'characters',id)==='劉備');
const cao=model.ids(0,'characters').find(id=>model.name(0,'characters',id)==='曹操');
assert(Number.isInteger(liu)&&Number.isInteger(cao));
const liuFaction=model.ids(0,'factions').find(id=>model.read(0,'factions',id,'ruler')===liu);
const factionTemplate=model.bytes.slice(model.address(0,'factions',liuFaction),model.address(0,'factions',liuFaction)+64);
model.bytes.fill(0,128,128+22*64);
for(let id=0;id<22;id++)model.bytes[model.address(0,'factions',id)+42]=255;
for(const [id,ruler,capital] of [[0,liu,3],[1,cao,7]]){
  const a=model.address(0,'factions',id);model.bytes.set(factionTemplate,a);model.bytes[a]=128;
  model.bytes[a+1]=ruler;model.bytes[a+2]=127;model.bytes[a+3]=capital;model.bytes[a+42]=255;model.bytes[a+62]=id;model.bytes[a+63]=127;
  // Refresh caches from the new cities rather than retain old faction geography.
  model.bytes.fill(0,a+10,a+22);model.bytes[a+24]=1;model.bytes[a+35]=4;model.bytes[a+40]=4;
}
for(let id=0;id<127;id++){
  const a=model.address(0,'characters',id);model.bytes[a]=128;
  model.bytes.fill(0,a+23,a+28);model.bytes[a+25]=255;model.bytes[a+28]=id===liu?0:id===cao?1:255;model.bytes[a+29]=255;
}
model.bytes.fill(0,0x22c0,0x42c0);
model.bytes[58]=2;model.renameChapter(0,'ARAM之章');
for(let id=0;id<192;id++){
  const n=nodes[id],a=model.address(0,'cities',id);model.bytes.set(sourceCity,a);model.rename(0,'cities',id,n.name);
  model.bytes[a]=0;model.bytes[a+1]=n.owner;model.bytes[a+22]=(sourceCity[22]&240)|(n.base?0:id<11?2:4);
  model.bytes[a+25]=255;model.bytes[a+26]=n.owner;model.bytes[a+27]=0;model.bytes.fill(255,a+28,a+32);
  model.bytes.fill(0,a+20,a+22);
  if(id>=11){model.bytes.fill(0,a+12,a+20);model.bytes[a+16]=100;}
}
// One map is shared by all chapters; keep every chapter's positions and links consistent.
const network=syncMap(model,world);
assert.deepEqual(network.errors,[]);assert.equal(network.cities.length,192);assert.equal(network.edges.length,14);
for(let id=0;id<192;id++){
  assert.deepEqual(network.cities[id],[nodes[id].x,nodes[id].y]);
  assert.deepEqual([...network.adjacency[id]].sort((a,b)=>a-b),[...adjacency[id]].sort((a,b)=>a-b));
}
assert.deepEqual(model.ids(0,'factions'),[0,1]);
assert.equal(model.ids(0,'characters').filter(id=>model.read(0,'characters',id,'owner')!==255).length,2);
assert(model.ids(0,'characters').every(id=>model.read(0,'characters',id,'preferred')===255));
assert.equal(model.ids(0,'cities').filter(id=>model.read(0,'cities',id,'owner')===0).length,4);
assert.equal(model.ids(0,'cities').filter(id=>model.read(0,'cities',id,'owner')===1).length,4);
assert.deepEqual(model.validate(world),[]);
const scenario=model.exportChecked(world),map=world.export();
assert.deepEqual(new Scenario(scenario).validate(new WorldMap(map)),[]);
await mkdir(output,{recursive:true});
await writeFile(`${output}/SINARIO.DAT`,scenario);await writeFile(`${output}/MMAP.MAP`,map);
const report={title:model.title(0),activeCities:nodes.slice(0,11),edges,parkedCities:181,activeFactions:['劉備','曹操'],rulers:[liu,cao],unaffiliated:125,sharedMapUpdatesAllChapters:true,routePoints:network.routePoints,routeBytes:network.routeBytes,maxPathPoints:network.maxPathPoints,sha256:Object.fromEntries([['SINARIO.DAT',scenario],['MMAP.MAP',map]].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')]))};
await writeFile(`${output}/verification.json`,JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--apply')){
  assert.deepEqual(new Uint8Array(await readFile(`${game}/SINARIO.DAT`)),original,'Game scenario changed during generation');
  assert.deepEqual(new Uint8Array(await readFile(`${game}/MMAP.MAP`)),originalMap,'Game map changed during generation');
  const backup=`local/extracted/WDRAGON/aram-backup/apply-${Date.now()}`;await mkdir(backup,{recursive:true});
  await writeFile(`${backup}/SINARIO.DAT`,original);await writeFile(`${backup}/MMAP.MAP`,originalMap);
  try{await copyFile(`${output}/MMAP.MAP`,`${game}/MMAP.MAP`);await copyFile(`${output}/SINARIO.DAT`,`${game}/SINARIO.DAT`);
    assert.deepEqual(new Scenario(await readFile(`${game}/SINARIO.DAT`)).validate(new WorldMap(await readFile(`${game}/MMAP.MAP`))),[]);
  }catch(error){
    const rollback=[];
    for(const [name,bytes] of [['SINARIO.DAT',original],['MMAP.MAP',originalMap]])try{
      const actual=new Uint8Array(await readFile(`${game}/${name}`));
      if(!Buffer.from(actual).equals(Buffer.from(bytes)))await writeFile(`${game}/${name}`,bytes);
    }catch(restoreError){rollback.push(restoreError);}
    if(rollback.length)throw new AggregateError([error,...rollback],`Apply failed; recover original files from ${backup}`);
    throw error;
  }
  console.log('Applied ARAM chapter; backup: '+backup);
}
console.log(JSON.stringify(report,null,2));
