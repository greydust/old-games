import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await import('./wdragon_editor.js');
const game='local/binary/WDRAGON',saved='local/extracted/WDRAGON/aram';
const input=await readFile(`${game}/SINARIO.DAT`),model=new WdragonEditor.Scenario(input);
const count=model.clearInactiveDiplomacy(),output=model.export();
for(let i=0;i<input.length;i++)if(input[i]!==output[i]){
  const a=i%0x56c0;assert(a>=128 && a<128+22*64 && (a-128)%64===42);assert.equal(output[i],255);
}
assert.deepEqual(model.validate(new WdragonEditor.WorldMap(await readFile(`${game}/MMAP.MAP`))),[]);
const backup=`local/extracted/WDRAGON/aram-backup/diplomacy-${Date.now()}`;
await mkdir(backup,{recursive:true});await writeFile(`${backup}/SINARIO.DAT`,input);
await writeFile('local/extracted/WDRAGON/aram/diplomacy-fixed.dat',output);
if(process.argv.includes('--apply')){
  assert.deepEqual(await readFile(`${game}/SINARIO.DAT`),input);
  await writeFile(`${game}/SINARIO.DAT`,output);assert.deepEqual(await readFile(`${game}/SINARIO.DAT`),Buffer.from(output));
  const previous=await readFile(`${saved}/SINARIO.DAT`);
  if(previous.equals(input)){
    await writeFile(`${saved}/SINARIO.DAT`,output);
    const report=JSON.parse(await readFile(`${saved}/verification.json`,'utf8'));report.sha256['SINARIO.DAT']=createHash('sha256').update(output).digest('hex');report.inactiveDiplomacyFixed=true;
    await writeFile(`${saved}/verification.json`,JSON.stringify(report,null,2)+'\n');
  }
}
console.log(JSON.stringify({clearedInactiveSlots:count,backup,applied:process.argv.includes('--apply'),saveUntouched:true}));
