import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
await import('./wdragon_editor.js');
const {Scenario,WorldMap,analyzeRoutes}=globalThis.WdragonEditor;
const source=await readFile('local/binary/WDRAGON/SINARIO.DAT');
const compressed=await readFile('local/binary/WDRAGON/MMAP.MAP');
const exe=await readFile('local/binary/WDRAGON/KI.EXE');
// Pin the executable instructions used in reconstructing the tracer.
for(const [offset,hex] of [[0xe4ac,'2ec6067ee4c0'],[0xe722,'2ec70680e40020'],[0xe822,'3cd4'],[0xe88f,'fec4'],[0xe961,'3bf7742c268a043cb872253cdd']]) {
  const expected=Buffer.from(hex,'hex');assert.deepEqual(exe.subarray(offset+512,offset+512+expected.length),expected);
}
const world=new WorldMap(compressed),network=world.routes(),model=new Scenario(source);
assert.deepEqual(network.errors,[]);
assert.equal(network.cities.length,192);assert.equal(network.ports,508);assert.equal(network.edges.length,254);
assert.equal(network.routePoints,5526);assert.equal(network.routeBytes,30296);assert.equal(network.maxPathPoints,84);
for(let c=0;c<4;c++)for(let id=0;id<192;id++) {
  assert.deepEqual(network.cities[id],[model.read(c,'cities',id,'x'),model.read(c,'cities',id,'y')]);
  const neighbors=[0,1,2,3].map(i=>model.read(c,'cities',id,`neighbor${i}`)).filter(i=>i!==255).sort((a,b)=>a-b);
  assert.deepEqual([...network.adjacency[id]].sort((a,b)=>a-b),neighbors,`chapter ${c}, city ${id}`);
}
model.referenceNetwork=network;assert.deepEqual(model.validate(),[]);assert.deepEqual(model.validate(world),[]);
// Reciprocal metadata alone is insufficient: it must agree with the actual map.
const edge=network.edges[0];model.link(0,edge.from,edge.to,false);
assert(model.validate().some(e=>e.table==='cities' && e.key.startsWith('neighbor')));
assert.throws(()=>model.exportChecked(world));
model.reset();assert.deepEqual(model.validate(world),[]);
// Removing a real interior road tile must invalidate both map and scenario export.
const broken=network.edges.find(e=>e.path.length>10).path[5];
for(const dy of [-1,0,1])for(const dx of [-1,0,1])world.tiles[broken+dy*384+dx]=0;
assert(world.routes().errors.length);assert(model.validate(world).some(e=>e.table==='map'));
assert.throws(()=>model.exportChecked(world));world.reset();
// Synthetic isolated cities allow controlled road failures without touching source files.
function fixture(){const tiles=new Uint8Array(384*256);tiles[10*384+10]=203;
  for(let i=0;i<191;i++)tiles[(100+Math.floor(i/64)*5)*384+2+(i%64)*5]=203;
  return tiles;
}
const loop=fixture();for(const [x,y,t] of [[11,10,212],[12,10,186],[13,10,186],[13,11,186],[12,11,186]])loop[y*384+x]=t;
assert(analyzeRoutes(loop).errors.some(e=>e.message.includes('迴圈')));
const long=fixture();long[10*384+11]=212;for(let x=12;x<300;x++)long[10*384+x]=186;
assert(analyzeRoutes(long).errors.some(e=>e.message.includes('路徑點數')));
const badEnd=fixture();badEnd[10*384+11]=212;badEnd[10*384+12]=186;badEnd[10*384+13]=212;
assert(analyzeRoutes(badEnd).errors.some(e=>e.message.includes('端點')));
const crowded=new Uint8Array(384*256);
for(let row=0;row<24;row++)for(let column=0;column<4;column++) {
  const y=2+row*10,left=2+column*96,right=left+80;
  crowded[y*384+left]=crowded[y*384+right]=203;
  for(let x=left+1;x<right;x++)crowded[y*384+x]=(x===left+1 || x===right-1)?212:186;
}
const overflow=analyzeRoutes(crowded);assert.equal(overflow.edges.length,96);
assert(overflow.maxPathPoints<256);assert(overflow.errors.some(e=>e.message.includes('緩衝區')));
assert.deepEqual(source,await readFile('local/binary/WDRAGON/SINARIO.DAT'));
assert.deepEqual(compressed,await readFile('local/binary/WDRAGON/MMAP.MAP'));
await mkdir('local/extracted/WDRAGON',{recursive:true});
await writeFile('local/extracted/WDRAGON/routes-verification.json',JSON.stringify(network,null,2)+'\n');
await writeFile('assets/games/wdragon/routes.json',JSON.stringify({cities:network.cities,adjacency:network.adjacency,errors:[]})+'\n');
console.log('Passed: 192 cities, 508 ports, 254 roads; exact adjacency match across all four chapters; broken road, loop, bad endpoint, path length, buffer overflow and export gating.');
