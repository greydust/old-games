import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await import('./wdragon_editor.js');
const {Scenario,WorldMap}=globalThis.WdragonEditor;
const game='local/binary/WDRAGON',saved='local/extracted/WDRAGON/aram';
const report=JSON.parse(await readFile(`${saved}/verification.json`,'utf8'));
const files=['SINARIO.DAT','MMAP.MAP',...(report.sha256['ICONGRF.DAT']?['ICONGRF.DAT']:[])],target={},before={};
const existing=async path=>{try{return await readFile(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
for(const name of files){
  target[name]=await readFile(`${saved}/${name}`);
  assert.equal(createHash('sha256').update(target[name]).digest('hex'),report.sha256[name]);
  before[name]=await existing(`${game}/${name}`);
}
assert.deepEqual(new Scenario(target['SINARIO.DAT']).validate(new WorldMap(target['MMAP.MAP'])),[]);
const backup=`local/extracted/WDRAGON/aram-backup/reapply-${Date.now()}`;
await mkdir(backup,{recursive:true});for(const name of files)if(before[name])await writeFile(`${backup}/${name}`,before[name]);
await writeFile(`${backup}/state.json`,JSON.stringify(Object.fromEntries(files.map(name=>[name,before[name]?'backed up':'missing before reapply'])),null,2));
try{
  for(const name of files){assert.deepEqual(await existing(`${game}/${name}`),before[name]);await writeFile(`${game}/${name}`,target[name]);}
  for(const name of files)assert.deepEqual(await readFile(`${game}/${name}`),target[name]);
  assert.deepEqual(new Scenario(await readFile(`${game}/SINARIO.DAT`)).validate(new WorldMap(await readFile(`${game}/MMAP.MAP`))),[]);
}catch(error){
  const failures=[];
  for(const name of files)try{const actual=await existing(`${game}/${name}`);if(before[name]){if(!actual?.equals(before[name]))await writeFile(`${game}/${name}`,before[name]);}else if(actual)await unlink(`${game}/${name}`);}catch(e){failures.push(e);}
  if(failures.length)throw new AggregateError([error,...failures],`Restore from ${backup}`);throw error;
}
console.log('ARAM reapplied and verified. Backup: '+backup);
