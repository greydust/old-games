import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
await import('./wdragon_editor.js');
class Element {
  constructor(tag){this.tag=tag;this.style={};this.children=[];this.dataset={};this.events={};this.attributes={};this.value='';this.textContent='';}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
  querySelectorAll(selector){return this.children.flatMap(c=>typeof c==='object'?[...(selector==='[data-field]'&&c.dataset.field?[c]:[]),...c.querySelectorAll(selector)]:[]);}
  get options(){return this.children;}
  click(){if(this.tag==='a')downloads.push(this);}
  remove(){} scrollIntoView(){} focus(){}
}
const downloads=[],blobs=new Map();
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body')};
URL.createObjectURL=blob=>{const url='blob:'+blobs.size;blobs.set(url,blob);return url;};URL.revokeObjectURL=()=>{};
globalThis.fetch=async path=>{const bytes=await readFile(path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),json:async()=>JSON.parse(bytes)};};
const root=new Element('root');WdragonEditor.render(root);
const controls=root.children[0],upload=controls.children[0].children[0],download=controls.children[1],reset=controls.children[2];
assert.equal(upload.multiple,true);assert.equal(upload.attributes.webkitdirectory,'');assert.equal(download.textContent,'檢查並下載整包');assert.equal(reset.textContent,'還原全部');assert.equal(controls.children.length,3);
const names=['SINARIO.DAT','MMAP.MAP','ICONGRF.DAT'];
const bytes=await Promise.all(names.map(n=>readFile('local/extracted/WDRAGON/aram/'+n)));
const files=bytes.map((b,i)=>({name:names[i].toLowerCase(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}));
upload.files=files.slice(0,2);await upload.events.change();assert.match(root.children[1].textContent,/缺少：ICONGRF.DAT/);assert.equal(download.disabled,true);
upload.files=[...files.map(f=>({...f,webkitRelativePath:'WDRAGON/'+f.name})),{name:'OTHER.DAT',webkitRelativePath:'WDRAGON/OTHER.DAT',arrayBuffer:()=>{throw new Error('Unrelated file read');}},{...files[0],webkitRelativePath:'WDRAGON/backup/SINARIO.DAT',arrayBuffer:()=>{throw new Error('Nested backup read');}}];await upload.events.change();assert.equal(download.disabled,false);
await download.events.click();assert.equal(downloads.length,1);assert.equal(downloads[0].download,'WDRAGON.zip');
function entries(buffer){const result=new Map(),v=new DataView(buffer);let p=0;while(v.getUint32(p,true)===0x04034b50){const length=v.getUint32(p+18,true),n=v.getUint16(p+26,true),extra=v.getUint16(p+28,true),name=new TextDecoder().decode(new Uint8Array(buffer,p+30,n)),start=p+30+n+extra;result.set(name,new Uint8Array(buffer,start,length));p=start+length;}return result;}
const initial=entries(await blobs.get(downloads[0].href).arrayBuffer());for(let i=0;i<3;i++)assert.deepEqual(initial.get(names[i]),new Uint8Array(bytes[i]));
const panel=root.children[4],title=panel.children[0].children[2].children[0];title.value='測試章';await title.events.change();
await download.events.click();const edited=entries(await blobs.get(downloads.at(-1).href).arrayBuffer());assert.notDeepEqual(edited.get('SINARIO.DAT'),initial.get('SINARIO.DAT'));
await reset.events.click();await download.events.click();const restored=entries(await blobs.get(downloads.at(-1).href).arrayBuffer());for(const name of names)assert.deepEqual(restored.get(name),initial.get(name));
// A failed replacement must leave the last successfully loaded package intact.
upload.files=[files[0],files[1],{name:'ICONGRF.DAT',arrayBuffer:async()=>new ArrayBuffer(1)}];await upload.events.change();assert.match(root.children[1].textContent,/格式或長度/);await download.events.click();assert.equal(downloads.length,4);
console.log('Verified folder selection ignoring unrelated files and nested backups, required three-file upload, case-insensitive names, atomic failed upload, unified ZIP, byte-exact unchanged export, edit and restore-all.');

