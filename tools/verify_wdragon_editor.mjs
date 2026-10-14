import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
await import('./wdragon_editor.js');
const {Scenario}=globalThis.WdragonEditor;
const source=new Uint8Array(await readFile(new URL('../local/binary/WDRAGON/SINARIO.DAT',import.meta.url)));
const model=new Scenario(source);
assert.deepEqual(model.export(),source,'Unedited file must remain byte-identical');
assert.equal(model.changed,false);
const touched=new Set();
for(let chapter=0;chapter<4;chapter++) {
  const base=chapter*0x56c0;
  model.write(chapter,'characters',0,'martial',15);touched.add(base+0x42c0+17);
  model.write(chapter,'characters',0,'city',10);touched.add(base+0x42c0+14);
  assert.equal(model.bytes[base+0x42c0+14]&15,source[base+0x42c0+14]&15,'Preserve proficiency lower nibble');
  model.write(chapter,'characters',0,'suicide',1);touched.add(base+0x42c0);
  assert.equal(model.bytes[base+0x42c0]&~16,source[base+0x42c0]&~16,'Preserve other character flags');
  model.write(chapter,'characters',0,'preferred',255);touched.add(base+0x42c0+25);
  model.write(chapter,'cities',0,'production_limit',65535);touched.add(base+0x8c0+12);touched.add(base+0x8c0+13);
  model.write(chapter,'cities',0,'production',32100);touched.add(base+0x8c0+14);touched.add(base+0x8c0+15);
  model.write(chapter,'cities',0,'growth',-50);touched.add(base+0x8c0+16);
  model.write(chapter,'factions',0,'funds',-123456);for(let i=32;i<35;i++)touched.add(base+128+i);
  model.write(chapter,'factions',0,'cavalry',123450);touched.add(base+132);touched.add(base+133);
  assert.equal(model.read(chapter,'factions',0,'funds'),-123456);
  assert.equal(model.read(chapter,'factions',0,'cavalry'),123450);
}
const result=model.export();
for(let i=0;i<source.length;i++)if(!touched.has(i))assert.equal(result[i],source[i],`Unexpected write at ${i}`);
assert.equal(model.changed,true);
const reload=new Scenario(result);
assert.equal(reload.read(3,'cities',0,'production'),32100);
assert.equal(reload.read(2,'characters',0,'preferred'),255);
for(const action of [()=>model.write(0,'characters',0,'martial',16),()=>model.write(0,'characters',0,'city',1.5),
  ()=>model.write(0,'factions',0,'cavalry',11),()=>model.write(0,'cities',0,'production_limit',100),
  ()=>model.write(0,'characters',0,'preferred',254)]) {
  const before=model.export();assert.throws(action);assert.deepEqual(model.export(),before,'Invalid edit must not mutate bytes');
}
model.reset();assert.deepEqual(model.export(),source);assert.equal(model.changed,false);
assert.deepEqual(source,new Uint8Array(await readFile(new URL('../local/binary/WDRAGON/SINARIO.DAT',import.meta.url))));
assert.throws(()=>new Scenario(new Uint8Array(1)));
assert.throws(()=>new Scenario(new Uint8Array(source.length)));
console.log('Passed four-chapter round-trip, isolated edits, flag/nibble preservation, invalid edits, reset and source integrity.');
