import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await import('./wdragon_editor.js');
const game='local/binary/WDRAGON',out='local/extracted/WDRAGON/minimap-fix';
const icon=await readFile(`${game}/ICONGRF.DAT`),mdl=await readFile(`${game}/MMAP.MDL`),palette=await readFile(`${game}/GAMEPAL.BRG`);
const mapFile=await readFile(`${game}/MMAP.MAP`),world=new WdragonEditor.WorldMap(mapFile),result=Buffer.from(icon);
assert.equal(icon.length,47776);assert.equal(mdl.length,32768);
// KI load image 009E..00AF loads ICONGRF.DAT+6700, length3000.
// This is a 192x128 four-plane bitmap, separate from the editable tile map.
const start=0x6700,end=0x9700,plane=192*128/8;
const rgb=Array.from({length:16},(_,i)=>[palette[i*3+1],palette[i*3+2],palette[i*3]]);
const nearest=color=>rgb.map(v=>v.reduce((s,c,k)=>s+(c-color[k])**2,0)).reduce((best,d,i,a)=>d<a[best]?i:best,0);
const average=Array.from({length:256},(_,tile)=>{
  const sum=[0,0,0];for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    let color=0;for(let k=0;k<4;k++)color|=((mdl[tile*128+k*32+y*2+(x>>3)]>>(7-(x&7)))&1)<<k;
    for(let k=0;k<3;k++)sum[k]+=rgb[color][k];
  }return sum.map(v=>v/256);
});
const pixels=new Uint8Array(192*128),roadColor=nearest([15,12,3]);
const center=t=>t>=203 && t<212;
for(let y=0;y<128;y++)for(let x=0;x<192;x++){
  const tiles=[world.tiles[(y*2)*384+x*2],world.tiles[(y*2)*384+x*2+1],world.tiles[(y*2+1)*384+x*2],world.tiles[(y*2+1)*384+x*2+1]];
  // Keep city markers dynamic; render terrain and real roads in the fixed layer.
  const terrain=tiles.map(t=>t>=203?average[182]:average[t]);
  pixels[y*192+x]=tiles.some(t=>t>=184 && t<=202)?roadColor:nearest([0,1,2].map(k=>terrain.reduce((s,t)=>s+t[k],0)/4));
}
result.fill(0,start,end);
for(let y=0;y<128;y++)for(let x=0;x<192;x++)for(let k=0;k<4;k++)if(pixels[y*192+x]&(1<<k))result[start+k*plane+y*24+(x>>3)]|=0x80>>(x&7);
assert.deepEqual(result.subarray(0,start),icon.subarray(0,start));assert.deepEqual(result.subarray(end),icon.subarray(end));
for(let y=0;y<128;y++)for(let x=0;x<192;x++){
  let color=0;for(let k=0;k<4;k++)color|=((result[start+k*plane+y*24+(x>>3)]>>(7-(x&7)))&1)<<k;
  assert.equal(color,pixels[y*192+x]);
}
await mkdir(out,{recursive:true});await writeFile(`${out}/ICONGRF.DAT`,result);await writeFile(`${out}/pixels.bin`,pixels);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await writeFile(`${out}/verification.json`,JSON.stringify({offset:start,length:end-start,mapSha256:hash(mapFile),originalIconSha256:hash(icon),patchedIconSha256:hash(result),otherBytesUnchanged:true,dosboxTested:false},null,2)+'\n');
// Retain the matching map overview with the saved ARAM package for future reapply.
const aram='local/extracted/WDRAGON/aram';
try{const report=JSON.parse(await readFile(`${aram}/verification.json`,'utf8'));if(report.sha256['MMAP.MAP']===hash(mapFile)){await writeFile(`${aram}/ICONGRF.DAT`,result);report.sha256['ICONGRF.DAT']=hash(result);await writeFile(`${aram}/verification.json`,JSON.stringify(report,null,2)+'\n');}}catch(e){if(e.code!=='ENOENT')throw e;}
if(process.argv.includes('--apply')){
  assert.deepEqual(await readFile(`${game}/ICONGRF.DAT`),icon);assert.deepEqual(await readFile(`${game}/MMAP.MAP`),mapFile);
  const backup=`local/extracted/WDRAGON/aram-backup/minimap-${Date.now()}`;await mkdir(backup,{recursive:true});await writeFile(`${backup}/ICONGRF.DAT`,icon);
  await writeFile(`${game}/ICONGRF.DAT`,result);assert.deepEqual(await readFile(`${game}/ICONGRF.DAT`),result);
  console.log('Updated fixed minimap only. Backup: '+backup);
}
console.log('Verified 192x128 bitmap round-trip and all other interface bytes unchanged.');
