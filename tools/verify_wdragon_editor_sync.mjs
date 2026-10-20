import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
await import('./wdragon_editor.js');
const {Scenario,WorldMap,moveCity,paintTile,syncMap,setNeighbor,removeRoadAt}=WdragonEditor;
const bytes=await readFile('local/binary/WDRAGON/SINARIO.DAT'),map=await readFile('local/binary/WDRAGON/MMAP.MAP');
const fresh=()=>[new Scenario(bytes),new WorldMap(map)];
{
  const [model,world]=fresh(),network=world.routes(),edge=network.edges.find(e=>e.from===1 && e.to===2 || e.from===2 && e.to===1),old=world.tiles.slice();
  const middle=edge.path[Math.floor(edge.path.length/2)];removeRoadAt(model,world,middle%384,Math.floor(middle/384));
  assert(edge.path.every(p=>world.tiles[p]<184 || world.tiles[p]>221),'Deleted road must remove its actual road and entrance tiles');
  for(const other of network.edges)if(other!==edge)for(const p of other.path)assert.equal(world.tiles[p],old[p],'Other road tiles must remain intact');
  assert.deepEqual(model.validate(world),[]);assert.deepEqual(new WorldMap(world.export()).tiles,world.tiles);
  const saved=world.export();assert.throws(()=>removeRoadAt(model,world,NaN,0));assert.deepEqual(world.export(),saved);
}
{
  const [model,world]=fresh();
  const dai=1,zhuo=2,yi=3,originalLinks=Array.from({length:4},(_,c)=>[0,1,2,3].map(j=>model.read(c,'cities',yi,`neighbor${j}`)));
  setNeighbor(model,world,0,dai,'neighbor0',255);
  for(let c=0;c<4;c++) {
    assert.equal(model.read(c,'cities',dai,'neighbor0'),255);
    assert.equal(model.read(c,'cities',zhuo,'neighbor3'),255);
    assert.equal(model.read(c,'cities',zhuo,'neighbor0'),yi);
    assert.deepEqual([0,1,2,3].map(j=>model.read(c,'cities',yi,`neighbor${j}`)),originalLinks[c]);
  }
  assert.deepEqual(model.validate(world),[]);model.exportChecked(world);
  // Missing reverse links must never mark a separate, valid first-slot road.
  const [missing,originalWorld]=fresh();missing.link(0,dai,zhuo,false);
  const errors=missing.validate(originalWorld).filter(e=>e.id===zhuo);
  assert(errors.some(e=>e.key==='neighbor3'));assert(!errors.some(e=>e.key==='neighbor0'));
}
// Intermediate relocations must not leave extra connector roads behind.
{
  const [sequential,world]=fresh(),[direct,directWorld]=fresh();
  for(const [x,y] of [[256,9],[260,9],[257,7]])moveCity(sequential,world,0,x,y);
  moveCity(direct,directWorld,0,257,7);assert.deepEqual(world.tiles,directWorld.tiles);
  assert.deepEqual(sequential.export(),direct.export());
  moveCity(sequential,world,0,257,9);assert.deepEqual(world.export(),new Uint8Array(map));
  assert.deepEqual(sequential.validate(world),[]);
  moveCity(sequential,world,0,256,9);world.set(0,0,(world.tiles[0]+1)%184);const painted=world.tiles[0];
  try{moveCity(sequential,world,0,260,9);}catch(e){assert.match(e.message,/取消搬移/);}
  assert.equal(world.tiles[0],painted);
}
let [s,w]=fresh();
const originalTiles=w.tiles.slice();
const unchanged=s.export(),unchangedMap=w.export();
assert.throws(()=>moveCity(s,w,0,250,9),/已取消搬移/);
assert.deepEqual(s.export(),unchanged);assert.deepEqual(w.export(),unchangedMap);assert.deepEqual(s.validate(w),[]);
moveCity(s,w,0,256,9);
for(let c=0;c<4;c++){assert.equal(s.read(c,'cities',0,'x'),256);assert.equal(s.read(c,'cities',0,'y'),9);}
assert.equal(w.tiles[9*384+256],205);assert.deepEqual(s.validate(w),[]);
assert(w.tiles.some((tile,p)=>tile!==originalTiles[p] && tile>=196 && tile<=201));
assert(!w.tiles.some((tile,p)=>tile!==originalTiles[p] && tile>=184 && tile<=195),'Moving Beijing must not draw river or bridge tiles on land');
assert.deepEqual(new WorldMap(w.export()).tiles,w.tiles);assert.deepEqual(new Scenario(s.exportChecked(w)).validate(w),[]);
const before=s.export(),tiles=w.tiles.slice();
for(const [x,y] of [[0,0],[383,255],[256,50],[NaN,9]]) {
  assert.throws(()=>moveCity(s,w,0,x,y));assert.deepEqual(s.export(),before);assert.deepEqual(w.tiles,tiles);
}
[s,w]=fresh();paintTile(s,w,0,256,9,205);assert.deepEqual(s.validate(w),[]);
for(let c=0;c<4;c++)assert.equal(s.read(c,'cities',0,'x'),256);
assert.throws(()=>paintTile(s,w,0,256,9,0));assert.equal(w.tiles[9*384+256],205);
// Map topology repairs a stale scenario link in every chapter, preserving valid slot order.
[s,w]=fresh();const edge=w.routes().edges[0];for(let c=0;c<4;c++)s.link(c,edge.from,edge.to,false);
syncMap(s,w);assert.deepEqual(s.validate(w),[]);
for(let c=0;c<4;c++)assert([0,1,2,3].some(i=>s.read(c,'cities',edge.from,`neighbor${i}`)===edge.to));
// Incomplete roads never silently replace the scenario's existing adjacency.
const old=s.export(),route=w.routes().edges.find(e=>e.path.length>10),p=route.path[5];
for(const dy of [-1,0,1])for(const dx of [-1,0,1])w.tiles[p+dy*384+dx]=0;
syncMap(s,w);assert.deepEqual(s.export(),old);assert.throws(()=>s.exportChecked(w));
assert.deepEqual(bytes,await readFile('local/binary/WDRAGON/SINARIO.DAT'));
assert.deepEqual(map,await readFile('local/binary/WDRAGON/MMAP.MAP'));
console.log('Passed bidirectional city/map sync, all chapters, road reconnection, topology sync, invalid move rollback and binary round-trip.');
