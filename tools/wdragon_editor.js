/* Original SINARIO.DAT: patch confirmed fields, preserve every other byte. */
(() => {
  const SIZE = 0x56c0, decoder = new TextDecoder('big5');
  let encoding;
  function encode(text, limit) {
    if (!encoding) {
      encoding=new Map();for(let i=32;i<127;i++)encoding.set(String.fromCharCode(i),[i]);
      for(let lead=0x81;lead<=0xfe;lead++)for(let trail=0x40;trail<=0xfe;trail++) {
        if(trail>0x7e && trail<0xa1)continue;
        const value=decoder.decode(new Uint8Array([lead,trail]));
        if(!value.includes('\ufffd') && [...value].length===1 && !encoding.has(value))encoding.set(value,[lead,trail]);
      }
    }
    if (!text.trim()) throw new Error('名稱不可空白。');
    const result=[];for(const ch of text) {if(!encoding.has(ch))throw new Error(`「${ch}」不在遊戲文字編碼內。`);result.push(...encoding.get(ch));}
    if(result.length>limit)throw new Error(`名稱最多 ${limit} 個英文或 ${limit/2} 個中文字。`);
    return new Uint8Array(result);
  }
  const schemas = {
    characters: {label:'武將', start:0x42c0, count:127, stride:32, fields:[
      ['martial','武術',17,1,1,15], ['leadership','統率',18,1,1,15], ['politics','政治',19,1,1,15],
      ['city','城塞戰適性',14,1,0,10,1,'nibble'], ['land','野戰適性',15,1,0,10,1,'nibble'],
      ['sea','海戰適性',16,1,0,10,1,'nibble'], ['suicide','自刎',0,1,0,1,1,'flag'],
      ['delay','登用等待月數',24,1,0,255], ['preferred','預定加入勢力',25,1,0,255,1,'faction'],
      ['owner','所屬勢力',28,1,0,255,1,'owner']
    ]},
    cities: {label:'城池', start:0x8c0, count:192, stride:32, fields:[
      ['production','生產力',14,2,0,65535], ['production_limit','生產力上限',12,2,0,65535],
      ['growth','上昇率',16,1,-100,100,1,'growth'], ['defense','防災',17,1,0,200],
      ['soldiers','城兵',19,1,0,2550,10], ['soldiers_limit','城兵上限',18,1,0,2550,10],
      ['x','地圖 X',8,2,0,383], ['y','地圖 Y',10,2,0,255], ['owner','所屬勢力',1,1,0,24,1,'owner'],
      ['administrator','內政官',25,1,0,255,1,'character'],
      ['neighbor0','相鄰據點 1',28,1,0,255,1,'neighbor'], ['neighbor1','相鄰據點 2',29,1,0,255,1,'neighbor'],
      ['neighbor2','相鄰據點 3',30,1,0,255,1,'neighbor'], ['neighbor3','相鄰據點 4',31,1,0,255,1,'neighbor']
    ]},
    factions: {label:'勢力', start:128, count:22, stride:64, fields:[
      ['funds','資金',32,3,-8388608,655000],
      ['cavalry','預備騎兵',4,2,0,655000,10], ['archer','預備弓兵',6,2,0,655000,10],
      ['infantry','預備步兵',8,2,0,655000,10], ['capital','首都',3,1,0,255,1,'city'],
      ['ruler','君主',1,1,0,255,1,'character'], ['strategist','軍師',2,1,0,255,1,'character']
    ]}
  };
  const decode = bytes => decoder.decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0))).trim();
  function analyzeRoutes(tiles) {
    const width=384,height=256,errors=[],cities=[],ports=[],edges=[],adjacency=Array.from({length:192},()=>[]);
    const road=p=>p>=0 && p<tiles.length && tiles[p]>=184 && tiles[p]<=221;
    const offsets=[-1,1,-width,width,-width-1,-width+1,width-1,width+1];
    const adjacent=(a,b)=>b>=0 && b<tiles.length && Math.abs(a%width-b%width)<=1 && Math.abs(Math.floor(a/width)-Math.floor(b/width))<=1;
    if(tiles.length!==width*height)return {cities,edges,adjacency,errors:[{message:'地圖大小不正確。'}]};
    for(let p=0;p<tiles.length;p++)if(tiles[p]>=203 && tiles[p]<212)cities.push([p%width,Math.floor(p/width)]);
    if(cities.length!==192)return {cities,edges,adjacency,errors:[{message:'地圖必須保留192個城池中心圖塊。'}]};
    for(let id=0;id<cities.length;id++) {
      const [x,y]=cities[id],p=y*width+x;
      for(let direction=0;direction<4;direction++) {
        const step=offsets[direction];
        const start=[p+step,p+step*2].find(q=>road(q) && Math.abs(q%width-x)+Math.abs(Math.floor(q/width)-y)<=2);
        if(start!==undefined)ports.push({id,direction,start});
      }
    }
    const registry=new Map(),used=new Set();
    for(const port of ports) {
      if(registry.has(port.start))errors.push({id:port.id,message:'兩個城池的道路出入口重疊。'});
      registry.set(port.start,port);
    }
    for(const port of ports) {
      if(used.has(port))continue;
      const path=[],seen=new Set();let current=port.start,previous=-1,direction=port.direction,failed=false;
      // E81C: a building-edge starting tile is emitted, then steps outward once.
      if(tiles[current]>=212){path.push(current);seen.add(current);previous=current;current+=offsets[direction];}
      while(true) {
        if(!road(current) || (previous>=0 && !adjacent(previous,current))){errors.push({id:port.id,x:current%width,y:Math.floor(current/width),message:'道路中斷或越出地圖。'});failed=true;break;}
        if(seen.has(current)){errors.push({id:port.id,message:'道路形成無法抵達端點的迴圈。'});failed=true;break;}
        seen.add(current);path.push(current);
        if(path.length-(tiles[port.start]>=212?1:0)>255){errors.push({id:port.id,message:'單條道路超過遊戲可記錄的路徑點數。'});failed=true;break;}
        if(tiles[current]>=203)break;
        const next=offsets.map((offset,index)=>({p:current+offset,index})).find(n=>n.p!==previous && adjacent(current,n.p) && road(n.p));
        if(!next){errors.push({id:port.id,x:current%width,y:Math.floor(current/width),message:'道路沒有可接續的圖塊。'});failed=true;break;}
        if(next.index<4)direction=next.index;
        previous=current;current=next.p;
      }
      if(failed){used.add(port);continue;}
      const end=registry.get(current);
      if(!end || end.direction!==(direction^1)){errors.push({id:port.id,message:'道路端點未對應到正確方向的城池出入口。'});used.add(port);continue;}
      if(used.has(end) || end===port || end.id===port.id){errors.push({id:port.id,message:'道路端點重複使用或連回自己。'});used.add(port);continue;}
      if(adjacency[port.id].includes(end.id)){errors.push({id:port.id,message:'同一對城池存在重複道路。'});used.add(port);used.add(end);continue;}
      used.add(port);used.add(end);edges.push({from:port.id,to:end.id,path});adjacency[port.id].push(end.id);adjacency[end.id].push(port.id);
    }
    const routePoints=edges.reduce((sum,e)=>sum+e.path.length,0),routeBytes=8192+routePoints*4,headerBytes=2048+edges.length*16;
    if(routeBytes>32768)errors.push({message:'道路路徑總量超過遊戲路網緩衝區。'});
    if(headerBytes>8192)errors.push({message:'道路數量超過遊戲路網表容量。'});
    return {cities,ports:ports.length,edges,adjacency,routePoints,routeBytes,headerBytes,maxPathPoints:Math.max(0,...edges.map(e=>e.path.length)),errors};
  }
  class WorldMap {
    constructor(input) {
      this.original=new Uint8Array(input).slice();const data=this.original;
      if(data.length<4 || new DataView(data.buffer).getUint32(0,true)!==384*256)throw new Error('請上傳有效的 MMAP.MAP。');
      const result=new Uint8Array(384*256);let n=0;
      for(let p=4;p<data.length;){const v=data[p++];if(n>=result.length)throw new Error('地圖長度不正確。');result[n++]=v;
        if(p<data.length && data[p]===v){p++;if(p>=data.length)throw new Error('地圖資料不完整。');const count=data[p++]+1;if(n+count>result.length)throw new Error('地圖長度不正確。');result.fill(v,n,n+count);n+=count;}}
      if(n!==result.length)throw new Error('地圖資料不完整。');this.tiles=result;this.initial=result.slice();
    }
    set(x,y,tile){if(![x,y,tile].every(Number.isInteger)||x<0||x>=384||y<0||y>=256||tile<0||tile>255)throw new Error('圖塊位置無效。');this.tiles[y*384+x]=tile;}
    routes(){return analyzeRoutes(this.tiles);}
    export(){if(this.tiles.every((v,i)=>v===this.initial[i]))return this.original.slice();const out=[0,128,1,0];
      for(let p=0;p<this.tiles.length;){const v=this.tiles[p];let n=1;while(p+n<this.tiles.length && this.tiles[p+n]===v && n<257)n++;if(n>=2)out.push(v,v,n-2);else out.push(v);p+=n;}return new Uint8Array(out);}
    reset(){this.tiles.set(this.initial);delete this.cityMoveBase;}
  }
  class Scenario {
    constructor(input) {
      const bytes = new Uint8Array(input);
      if (bytes.length !== SIZE*4) throw new Error('請選擇包含四個劇本的臥龍傳 SINARIO.DAT。');
      this.original = bytes.slice(); this.bytes = bytes.slice();
      this.view = new DataView(this.bytes.buffer);
      for (let chapter=0; chapter<4; chapter++) {
        const base = chapter*SIZE;
        // Validate the original layout before offering any writes.
        for (let i=0; i<192; i++) {
          const a=base+0x8c0+i*32;
          if (this.view.getUint16(a+8,true)>=384 || this.view.getUint16(a+10,true)>=256 || (bytes[a+22]&15)>4 ||
              [...bytes.subarray(a+28,a+32)].some(n=>n!==255 && n>=192)) throw new Error('城池資料不符合目前支援的劇本格式。');
        }
        for (let i=0; i<22; i++) {
          const a=base+128+i*64;
          if (bytes[a]>=128 && (bytes[a+1]>=127 || bytes[a+3]>=192)) throw new Error('勢力資料不符合目前支援的劇本格式。');
        }
        for (let i=0; i<127; i++) {
          const a=base+0x42c0+i*32;
          if (![255,...Array.from({length:22},(_,n)=>n)].includes(bytes[a+25])) throw new Error('武將資料不符合目前支援的劇本格式。');
        }
        if (!this.ids(chapter,'factions').length || !this.name(chapter,'characters',0)) throw new Error('檔案不包含可讀取的劇本資料。');
      }
    }
    address(chapter, table, id) {
      const schema=schemas[table];
      if (!schema || !Number.isInteger(chapter) || chapter<0 || chapter>3 || !Number.isInteger(id) || id<0 || id>=schema.count) throw new Error('無效的劇本或資料項目。');
      return chapter*SIZE+schema.start+id*schema.stride;
    }
    title(chapter) { return decode(this.bytes.subarray(chapter*SIZE+64,chapter*SIZE+128)); }
    name(chapter, table, id) {
      const a=this.address(chapter,table,id);
      return table==='factions' ? (this.bytes[a+1]<127?this.name(chapter,'characters',this.bytes[a+1]):'未設定君主') : decode(this.bytes.subarray(a+2,a+8));
    }
    ids(chapter, table) {
      return Array.from({length:schemas[table].count},(_,i)=>i).filter(i=>table==='cities' || this.bytes[this.address(chapter,table,i)]>=128);
    }
    read(chapter, table, id, key) {
      const f=schemas[table].fields.find(f=>f[0]===key);
      if (!f) throw new Error('不支援的設定。');
      const a=this.address(chapter,table,id)+f[2], b=this.bytes;
      let n=b[a]+(f[3]>1?b[a+1]*256:0)+(f[3]>2?b[a+2]*65536:0);
      if (f[3]===3 && n>=8388608) n-=16777216;
      if (f[7]==='nibble') return n>>4;
      if (f[7]==='flag') return Number(Boolean(n&16));
      if (f[7]==='growth') return n-100;
      return n*(f[6]||1);
    }
    write(chapter, table, id, key, value) {
      const f=schemas[table]?.fields.find(f=>f[0]===key);
      if (!f) throw new Error('不支援的設定。');
      if (typeof value!=='number' || !Number.isInteger(value) || value<f[4] || value>f[5] || value%(f[6]||1)!==0) throw new Error(`請輸入 ${f[4]}～${f[5]}，間隔 ${f[6]||1} 的整數。`);
      if (f[7]==='faction' && value!==255 && !this.ids(chapter,'factions').includes(value)) throw new Error('請選擇有效勢力或未指定。');
      if(f[7]==='owner' && value!==24 && value!==255 && value>=22)throw new Error('請選擇所屬勢力。');
      const counterpart = {production:'production_limit', soldiers:'soldiers_limit', production_limit:'production', soldiers_limit:'soldiers'}[key];
      if (table==='cities' && counterpart) {
        const other=this.read(chapter,table,id,counterpart);
        if ((key.endsWith('_limit') && value<other) || (!key.endsWith('_limit') && value>other)) throw new Error('目前值不可超過上限；請先調整另一個欄位。');
      }
      const a=this.address(chapter,table,id)+f[2];
      if (f[7]==='nibble') { this.bytes[a]=(this.bytes[a]&15)|(value<<4); return; }
      if (f[7]==='flag') { this.bytes[a]=(this.bytes[a]&~16)|(value?16:0); return; }
      let n=f[7]==='growth'?value+100:value/(f[6]||1);
      if (n<0) n+=16777216;
      for (let i=0;i<f[3];i++) { this.bytes[a+i]=n%256; n=Math.floor(n/256); }
      if(['owner','ruler','capital','administrator'].includes(key) || key.startsWith('neighbor'))this.rebuild(chapter);
    }
    rename(chapter,table,id,name) {
      if(table==='factions') {
        const ruler=this.read(chapter,table,id,'ruler');
        if(!this.ids(chapter,'characters').includes(ruler))throw new Error('請先設定有效君主；勢力名稱使用君主姓名。');
        return this.rename(chapter,'characters',ruler,name);
      }
      const a=this.address(chapter,table,id)+2, text=encode(name,6);
      this.bytes.fill(0,a,a+6);this.bytes.set(text,a);
    }
    renameChapter(chapter,name) {
      this.address(chapter,'cities',0);const text=encode(name,64),a=chapter*SIZE+64;
      this.bytes.fill(0,a,a+64);this.bytes.set(text,a);
    }
    cloneChapter(source,target) {
      this.address(source,'cities',0);this.address(target,'cities',0);
      if(source===target)throw new Error('來源與目標劇本不可相同。');
      this.bytes.set(this.bytes.slice(source*SIZE,(source+1)*SIZE),target*SIZE);
    }
    add(chapter,table) {
      if(table==='cities')throw new Error('遊戲固定使用192個城池槽，尚未確認安全的新增或刪除方式。請改名或搬移現有城池。');
      const schema=schemas[table],id=Array.from({length:schema.count},(_,i)=>i).find(i=>this.bytes[this.address(chapter,table,i)]<128);
      if(id===undefined)throw new Error(`沒有空槽；每劇本最多 ${schema.count} 個${schema.label}。`);
      const template=this.ids(chapter,table)[0],a=this.address(chapter,table,id);
      const copy=template===undefined?new Uint8Array(schema.stride):this.bytes.slice(this.address(chapter,table,template),this.address(chapter,table,template)+schema.stride);
      this.bytes.set(copy,a);this.bytes[a]=128;
      if(table==='characters') {
        this.bytes.fill(0,a+23,a+28);this.bytes[a+25]=255;this.bytes[a+28]=255;this.bytes[a+29]=255;
        this.bytes.fill(0,chapter*SIZE+0x22c0+id*64,chapter*SIZE+0x22c0+(id+1)*64);
        this.rename(chapter,table,id,'新武將');
      } else {
        this.bytes[a+1]=255;this.bytes[a+2]=127;this.bytes[a+3]=255;this.bytes[a+42]=255;
        this.bytes.fill(0,a+4,a+10);this.bytes.fill(0,a+32,a+35);
      }
      this.rebuild(chapter);return id;
    }
    remove(chapter,table,id) {
      if(table==='cities')return this.add(chapter,table);
      const a=this.address(chapter,table,id);
      for(let target=0;target<22;target++){
        const slot=this.address(chapter,'factions',target)+42,envoy=this.bytes[slot];
        if(envoy===255)continue;
        const person=envoy<127?this.address(chapter,'characters',envoy):null;
        if((table==='factions' && (target===id || (person!==null && this.bytes[person+28]===id))) || (table==='characters' && envoy===id)){
          this.bytes[slot]=255;
          if(person!==null && this.bytes[person+23]===3){this.bytes[person+23]=0;this.bytes[person+26]=0;}
        }
      }
      this.bytes[a]&=127;
      if(table==='characters')this.bytes[chapter*SIZE+0x22c0+id*64]=0;
      this.rebuild(chapter);
    }
    link(chapter,from,to,enabled=true) {
      this.address(chapter,'cities',from);this.address(chapter,'cities',to);
      if(from===to)throw new Error('城池不能連接自己。');
      const edits=[];
      for(const [a,b] of [[from,to],[to,from]]) {
        const start=this.address(chapter,'cities',a)+28,values=[...this.bytes.subarray(start,start+4)];
        let slot=values.indexOf(b);
        if(enabled && slot<0){slot=values.indexOf(255);if(slot<0)throw new Error(`${this.name(chapter,'cities',a)}已達四條連線上限。`);edits.push([start+slot,b]);}
        if(!enabled && slot>=0)edits.push([start+slot,255]);
      }
      for(const [a,b] of edits)this.bytes[a]=b;
      this.rebuild(chapter);
    }
    rebuild(chapter) {
      const chars=this.ids(chapter,'characters'),factions=this.ids(chapter,'factions');
      for(const id of chars)this.bytes[this.address(chapter,'characters',id)]&=~64;
      for(const id of factions) {
        const a=this.address(chapter,'factions',id),r=this.bytes[a+1];
        if(chars.includes(r))this.bytes[this.address(chapter,'characters',r)]|=64;
        this.bytes[a+24]=chars.filter(c=>this.read(chapter,'characters',c,'owner')===id && this.bytes[this.address(chapter,'characters',c)+29]===255).length;
        this.bytes[a+35]=this.ids(chapter,'cities').filter(c=>this.read(chapter,'cities',c,'owner')===id).length;
      }
      for(const id of this.ids(chapter,'cities')) {
        const a=this.address(chapter,'cities',id);let mask=0,count=0;
        for(let j=0;j<4;j++){const n=this.bytes[a+28+j];if(n<192 && this.bytes[this.address(chapter,'cities',n)+1]!==this.bytes[a+1]){mask|=1<<j;count++;}}
        this.bytes[a]=(this.bytes[a]&240)|mask;this.bytes[a+27]=count;
      }
      const administrators=this.ids(chapter,'cities').map(id=>this.read(chapter,'cities',id,'administrator'));
      for(const id of chars){const a=this.address(chapter,'characters',id);if(administrators.includes(id) && (this.bytes[a+23]===0 || this.bytes[a+23]===2))this.bytes[a+23]=2;else if(this.bytes[a+23]===2 && !administrators.includes(id))this.bytes[a+23]=0;}
    }
    validate(world=null) {
      const errors=[];
      const add=(chapter,table,id,key,message)=>errors.push({chapter,table,id,key,message,token:`${chapter}:${table}:${id}:${key}`});
      const network=world?world.routes():this.referenceNetwork;
      const markers=network?.cities||null;
      if(network)for(const e of network.errors||[])add(0,'map',0,'tiles',e.message);
      for(let c=0;c<4;c++) {
        const chars=this.ids(c,'characters'),factions=this.ids(c,'factions'),cities=this.ids(c,'cities');
        for(let id=0;id<22;id++){
          const a=this.address(c,'factions',id);
          if(this.bytes[a]<128 && this.bytes[a+42]!==255)add(c,'factions',id,'ruler','已刪除勢力殘留外交官；下載時會自動清除。');
        }
        if(!this.title(c))add(c,'chapter',0,'name','劇本名稱不可空白。');
        if(!factions.length)add(c,'factions',0,'ruler','劇本至少需要一個勢力。');
        const rulers=new Map();
        for(const table of ['characters','cities','factions'])for(const id of this.ids(c,table)) {
          if(!this.name(c,table,id).trim())add(c,table,id,'name','名稱不可空白。');
          for(const f of schemas[table].fields) {
            const n=this.read(c,table,id,f[0]);
            if(n<f[4] || n>f[5] || n%(f[6]||1))add(c,table,id,f[0],`${f[1]}超出合法範圍。`);
          }
        }
        for(const id of chars) {
          for(const key of ['preferred','owner']) {
            const n=this.read(c,'characters',id,key);
            if(n!==255 && !(key==='owner' && n===24) && !factions.includes(n))add(c,'characters',id,key,'引用的勢力不存在。');
          }
        }
        for(const id of factions) {
          const r=this.read(c,'factions',id,'ruler'),capital=this.read(c,'factions',id,'capital'),s=this.read(c,'factions',id,'strategist');
          if(!chars.includes(r))add(c,'factions',id,'ruler','君主不存在或已刪除。');
          else if(this.read(c,'characters',r,'owner')!==id)add(c,'factions',id,'ruler','君主必須屬於此勢力。');
          if(rulers.has(r)){add(c,'factions',id,'ruler','同一武將不能擔任兩個勢力的君主。');add(c,'factions',rulers.get(r),'ruler','同一武將不能擔任兩個勢力的君主。');}rulers.set(r,id);
          if(!cities.includes(capital))add(c,'factions',id,'capital','首都不存在。');
          else if(this.read(c,'cities',capital,'owner')!==id)add(c,'factions',id,'capital','首都必須屬於此勢力。');
          if(s!==127 && s!==255 && (!chars.includes(s) || this.read(c,'characters',s,'owner')!==id))add(c,'factions',id,'strategist','軍師必須是此勢力的有效武將。');
        }
        const positions=new Map(),admins=new Map();
        for(const id of cities) {
          const owner=this.read(c,'cities',id,'owner'),admin=this.read(c,'cities',id,'administrator');
          if(owner!==24 && !factions.includes(owner))add(c,'cities',id,'owner','城池所屬勢力不存在。');
          if(admin!==255 && (!chars.includes(admin) || this.read(c,'characters',admin,'owner')!==owner))add(c,'cities',id,'administrator','內政官不存在或不屬於此城池勢力。');
          if(chars.includes(admin)){const a=this.address(c,'characters',admin);if(this.bytes[a+23]!==2 || (this.bytes[a]&64))add(c,'cities',id,'administrator','內政官不可兼任君主、軍團長、外交官或俘虜。');}
          if(admin!==255 && admins.has(admin))add(c,'cities',id,'administrator','同一武將不能管理兩座城池。');admins.set(admin,id);
          for(const [value,limit] of [['production','production_limit'],['soldiers','soldiers_limit']])if(this.read(c,'cities',id,value)>this.read(c,'cities',id,limit))add(c,'cities',id,value,'目前值不可超過上限。');
          const p=`${this.read(c,'cities',id,'x')},${this.read(c,'cities',id,'y')}`;
          const a=this.address(c,'cities',id),oldX=this.original[a+8]+this.original[a+9]*256,oldY=this.original[a+10]+this.original[a+11]*256;
          if(!world && p!==`${oldX},${oldY}`)add(c,'cities',id,'x','座標已修改，請載入相符的地圖；只改座標不會搬移地圖上的城池與道路。');
          else if(markers?.length===192 && (markers[id][0]!==this.read(c,'cities',id,'x') || markers[id][1]!==this.read(c,'cities',id,'y')))add(c,'cities',id,'x',`座標與共用地圖不符（地圖位置：${markers[id][0]}, ${markers[id][1]}）。請在「地圖」同步城池中心及道路，並同步四個劇本的座標。`);
          if(positions.has(p)){add(c,'cities',id,'x','城池座標重疊。');add(c,'cities',positions.get(p),'x','城池座標重疊。');}positions.set(p,id);
          const ns=[];
          for(let j=0;j<4;j++) {
            const n=this.read(c,'cities',id,`neighbor${j}`);if(n===255)continue;
            if(n>=192 || n===id || ns.includes(n))add(c,'cities',id,`neighbor${j}`,'相鄰據點無效、重複或連到自己。');
            else if(![0,1,2,3].some(k=>this.read(c,'cities',n,`neighbor${k}`)===id))add(c,'cities',id,`neighbor${j}`,'相鄰連線必須雙向設定。');ns.push(n);
          }
          if(network?.cities.length===192 && !(network.errors||[]).length){
            const expected=network.adjacency[id];
            for(let j=0;j<4;j++){const n=this.read(c,'cities',id,`neighbor${j}`);if(n!==255 && !expected.includes(n))add(c,'cities',id,`neighbor${j}`,'相鄰據點在地圖上沒有對應行軍道路。');}
            for(const n of expected)if(!ns.includes(n)){const slot=[0,1,2,3].find(j=>this.read(c,'cities',id,`neighbor${j}`)===255);add(c,'cities',id,slot===undefined?'name':`neighbor${slot}`,`地圖道路連到${this.name(c,'cities',n)}，但相鄰資料未設定。`);}
          }
        }
      }
      return errors;
    }
    clearInactiveDiplomacy() {
      let count=0;
      for(let c=0;c<4;c++)for(let id=0;id<22;id++){
        const a=this.address(c,'factions',id);
        if(this.bytes[a]<128 && this.bytes[a+42]!==255){this.bytes[a+42]=255;count++;}
      }
      return count;
    }
    export() { return this.bytes.slice(); }
    exportChecked(world=null) { const errors=this.validate(world);if(errors.length){const e=new Error('劇本有不合法設定。');e.issues=errors;throw e;}return this.export(); }
    reset() { this.bytes.set(this.original); }
    get changed() { return this.bytes.some((b,i)=>b!==this.original[i]); }
  }
  const state={scenario:null, world:null, filename:'SINARIO.DAT', chapter:0, table:'characters', query:'', drafts:new Map(), checked:false, generation:0, mapCity:0, tile:0, reference:null, icon:null};
  function syncMap(model,world) {
    const network=world.routes();
    if(network.cities.length!==192)throw new Error('地圖必須保留192個城池中心。');
    for(let c=0;c<4;c++) {
      for(let id=0;id<192;id++) {
        model.write(c,'cities',id,'x',network.cities[id][0]);model.write(c,'cities',id,'y',network.cities[id][1]);
        if(!network.errors.length) {
          const a=model.address(c,'cities',id)+28,old=[...model.bytes.subarray(a,a+4)],neighbors=network.adjacency[id];
          const ordered=old.map(n=>neighbors.includes(n)?n:255);for(const n of neighbors)if(!ordered.includes(n))ordered[ordered.indexOf(255)]=n;
          model.bytes.set(ordered,a);
        }
      }
      model.rebuild(c);
    }
    return network;
  }
  function moveCity(model,world,id,x,y) {
    if(!world)throw new Error('請先載入地圖。');
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<2||x>381||y<2||y>253)throw new Error('城池圖塊需完整保留在地圖範圍內。');
    const history=world.cityMoveBase;
    if(history?.id===id && world.tiles.every((tile,p)=>tile===history.after[p])) {
      // Re-plan successive moves from the same unchanged map, rather than
      // accumulating temporary connector roads from each intermediate position.
      const planning={tiles:history.before.slice(),routes(){return analyzeRoutes(this.tiles);}};
      moveCity(model,planning,id,x,y);
      world.tiles.set(planning.tiles);world.cityMoveBase={id,before:history.before,after:planning.tiles.slice()};return;
    }
    const network=world.routes(),center=network.cities[id];
    if(network.cities.length!==192 || !center)throw new Error('請先修正地圖的城池中心數量。');
    const [oldX,oldY]=center;if(x===oldX && y===oldY){syncMap(model,world);return;}
    const before=world.tiles,candidate=before.slice(),source=new Set(),patch=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++) {
      const from=(oldY+dy)*384+oldX+dx,to=(y+dy)*384+x+dx;source.add(from);patch.push({from,to,tile:before[from]});
    }
    if(network.cities.some(([cx,cy],i)=>i!==id && (Math.abs(cx-oldX)<=2 && Math.abs(cy-oldY)<=2 || Math.abs(cx-x)<=4 && Math.abs(cy-y)<=4)))throw new Error('搬移位置會覆蓋其他城池，請選擇其他位置。');
    for(const p of patch)if(!source.has(p.to) && before[p.to]>=203)throw new Error('搬移位置會覆蓋其他建築圖塊。');
    // Vacated building cells use nearby terrain; keep existing roads in place.
    const terrain=patch.find(p=>p.tile<184)?.tile ?? [...before.subarray(Math.max(0,(oldY-3)*384+oldX-3),(oldY-3)*384+oldX+4)].find(t=>t<184) ?? 0;
    for(const p of patch)if(p.tile>=203)candidate[p.from]=terrain;
    for(const p of patch)candidate[p.to]=p.tile;
    // Extend each former entrance to its translated entrance. Complex crossings
    // remain subject to the game's exact route tracer before download.
    for(const edge of network.edges) {
      const path=edge.from===id?edge.path:edge.to===id?[...edge.path].reverse():null;
      if(!path || path.length<2)continue;
      const port=path[0],px=port%384,py=Math.floor(port/384),dx=px-oldX,dy=py-oldY;
      const sx=dx?Math.sign(dx):0,sy=dx?0:Math.sign(dy);
      let cx=px+x-oldX+sx,cy=py+y-oldY+sy;
      const tx=path[1]%384,ty=Math.floor(path[1]/384);
      const line=[];while(true){line.push(cy*384+cx);if(cx===tx && cy===ty)break;if(cx!==tx)cx+=Math.sign(tx-cx);else cy+=Math.sign(ty-cy);}
      if(line.every(p=>p>=0 && p<candidate.length && candidate[p]<203))for(let i=0;i<line.length;i++) {
        const p=line[i];if(candidate[p]>=184 && candidate[p]<=202)continue;
        const previous=i?line[i-1]:(py+y-oldY)*384+px+x-oldX,next=i+1<line.length?line[i+1]:path[2]??path[1];
        const direction=q=>q%384<p%384?1:q%384>p%384?2:q<p?4:q>p?8:0;
        const mask=direction(previous)|direction(next);
        // MMAP.MDL 196..199 are land-road bends, 200 horizontal, 201 vertical.
        // 184..195 contain river/bridge art and must not be used as generic fill.
        candidate[p]=({3:200,12:201,6:196,5:197,10:198,9:199})[mask] || (previous%384===p%384?201:200);
      }
    }
    const centers=[];for(let p=0;p<candidate.length;p++)if(candidate[p]>=203 && candidate[p]<212)centers.push(p);
    if(centers.length!==192 || centers[id]!==y*384+x || centers.some((p,i)=>i!==id && p!==network.cities[i][1]*384+network.cities[i][0]))throw new Error('此位置會改變城池ID順序，請在前後城池中心之間搬移。');
    const proposed=analyzeRoutes(candidate);
    if(proposed.errors.length)throw new Error('此位置無法自動接通道路，已取消搬移，城池與地圖保持原位。請選擇其他位置。');
    if(network.errors.length)throw new Error('目前地圖已有未接通的道路，請先修復道路或還原原版地圖，再搬移城池。');
    if(proposed.adjacency.some((neighbors,i)=>neighbors.length!==network.adjacency[i].length || neighbors.some(n=>!network.adjacency[i].includes(n))))throw new Error('此位置會讓道路錯接其他城池，已取消搬移，原有資料未變更。');
    const baseline=before.slice();world.tiles.set(candidate);syncMap(model,world);
    world.cityMoveBase={id,before:baseline,after:candidate.slice()};
  }
  function paintTile(model,world,id,x,y,tile) {
    if(!world)throw new Error('請先載入地圖。');
    if(![x,y,tile].every(Number.isInteger)||x<0||x>=384||y<0||y>=256||tile<0||tile>255)throw new Error('圖塊位置無效。');
    const p=y*384+x,old=world.tiles[p],isCenter=t=>t>=203 && t<212;
    if(isCenter(tile) && !isCenter(old)) {moveCity(model,world,id,x,y);world.set(x,y,tile);syncMap(model,world);return;}
    if(isCenter(old) && !isCenter(tile))throw new Error('請使用「搬移城池」，或在新位置繪製中心圖塊來搬移；不能直接刪除城池中心。');
    world.set(x,y,tile);syncMap(model,world);
  }
  function setNeighbor(model,world,chapter,id,key,value) {
    const old=model.read(chapter,'cities',id,key);
    if(value===old)return;
    if(value!==255)throw new Error('新增或改接連線需先在地圖繪製道路；接通後會自動同步雙向連線。');
    if(!world)throw new Error('請先載入地圖。');
    const network=world.routes();if(network.errors.length)throw new Error('請先修復地圖道路，再取消連線。');
    const edge=network.edges.find(e=>e.from===id && e.to===old || e.from===old && e.to===id);
    if(!edge){for(let c=0;c<4;c++)model.link(c,id,old,false);return;}
    const candidate=world.tiles.slice(),shared=new Set(network.edges.filter(e=>e!==edge).flatMap(e=>e.path)),remove=new Set(edge.path.filter(p=>!shared.has(p))),queue=[...remove];
    // Include unused road stubs attached to the deleted road, stopping at every
    // tile required by another valid route and at other building entrances.
    for(let i=0;i<queue.length;i++)for(const d of [-385,-384,-383,-1,1,383,384,385]) {
      const p=queue[i],q=p+d;if(q<0 || q>=candidate.length || Math.abs(q%384-p%384)>1 || shared.has(q) || remove.has(q))continue;
      if(candidate[q]>=184 && candidate[q]<=202){remove.add(q);queue.push(q);}
    }
    for(const p of remove) {
      if(shared.has(p))continue;
      const tile=candidate[p];
      if(tile>=203 && tile<212)throw new Error('此道路連到城池中心，無法自動移除，請在地圖調整。');
      if(tile>=212 && tile<=221)candidate[p]=230;
      else if(tile>=184 && tile<=202){const neighbors=[-1,1,-384,384].map(d=>world.tiles[p+d]);candidate[p]=neighbors.find(t=>t!==undefined && t<184)??0;}
    }
    const result=analyzeRoutes(candidate);
    if(result.errors.length || result.adjacency.some((ns,i)=>{const expected=network.adjacency[i].filter(n=>!(i===id&&n===old || i===old&&n===id));return ns.length!==expected.length || ns.some(n=>!expected.includes(n));}))throw new Error('此道路與其他道路共用圖塊，無法安全移除；原有連線未變更。');
    world.tiles.set(candidate);syncMap(model,world);
  }
  function removeRoadAt(model,world,x,y) {
    if(!world)throw new Error('請先載入地圖。');
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=384||y<0||y>=256)throw new Error('地圖位置無效。');
    const network=world.routes();if(network.errors.length)throw new Error('請先修復道路，或選擇原版地圖重新編輯。');
    const nearest=network.edges.map(edge=>({edge,distance:Math.min(...edge.path.map(p=>Math.hypot(p%384-x,Math.floor(p/384)-y)))})).sort((a,b)=>a.distance-b.distance);
    if(!nearest.length || nearest[0].distance>2)throw new Error('這裡沒有可移除的道路，請點道路圖塊或另一座相連城池。');
    if(nearest[1] && Math.abs(nearest[0].distance-nearest[1].distance)<.01)throw new Error('這裡有多條道路，請點道路中段以選擇要移除的一條。');
    const edge=nearest[0].edge,key=[0,1,2,3].find(j=>model.read(0,'cities',edge.from,`neighbor${j}`)===edge.to);
    if(key===undefined)throw new Error('道路與城池連線不一致，請先同步地圖資料。');
    setNeighbor(model,world,0,edge.from,`neighbor${key}`,255);return edge;
  }
  function buildMinimap(world,icon,mdl,palette) {
    icon=new Uint8Array(icon);mdl=new Uint8Array(mdl);palette=new Uint8Array(palette);
    if(icon.length!==47776 || mdl.length!==32768 || palette.length<48)throw new Error('小地圖資料不完整，請重新載入。');
    const result=icon.slice();
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

for(let y=0;y<128;y++)for(let x=0;x<192;x++){
  const tiles=[world.tiles[(y*2)*384+x*2],world.tiles[(y*2)*384+x*2+1],world.tiles[(y*2+1)*384+x*2],world.tiles[(y*2+1)*384+x*2+1]];
  // Keep city markers dynamic; render terrain and real roads in the fixed layer.
  const terrain=tiles.map(t=>t>=203?average[182]:average[t]);
  pixels[y*192+x]=tiles.some(t=>t>=184 && t<=202)?roadColor:nearest([0,1,2].map(k=>terrain.reduce((s,t)=>s+t[k],0)/4));
}
result.fill(0,start,end);
for(let y=0;y<128;y++)for(let x=0;x<192;x++)for(let k=0;k<4;k++)if(pixels[y*192+x]&(1<<k))result[start+k*plane+y*24+(x>>3)]|=0x80>>(x&7);
    return result;
  }
  // Store ZIP entries without compression so one browser download contains every file.
  function mapArchive(files) {
    const chunks=[],directory=[];let offset=0;
    const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
    for(const [name,bytes] of files){
      const n=new TextEncoder().encode(name),sum=crc(bytes),header=new Uint8Array(30+n.length),v=new DataView(header.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,sum,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,n.length,true);header.set(n,30);
      const central=new Uint8Array(46+n.length),d=new DataView(central.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(14,33,true);d.setUint32(16,sum,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,n.length,true);d.setUint32(42,offset,true);central.set(n,46);
      chunks.push(header,bytes);directory.push(central);offset+=header.length+bytes.length;
    }
    const length=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,length,true);v.setUint32(16,offset,true);
    const result=new Uint8Array(offset+length+22);let at=0;for(const bytes of [...chunks,...directory,end]){result.set(bytes,at);at+=bytes.length;}return result;
  }
  function render(parent) {
    const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
    const button=(text,action)=>{const b=el('button',text);b.type='button';b.addEventListener('click',action);return b;};
    const select=(options,value,label)=>{const s=el('select');s.setAttribute('aria-label',label);for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o);}s.value=value;return s;};
    parent.replaceChildren();
    const controls=el('div');controls.className='wd-controls';
    const label=el('label','選擇遊戲資料夾'),upload=el('input');upload.type='file';upload.multiple=true;upload.setAttribute('webkitdirectory','');label.append(upload);
    const status=el('p');status.setAttribute('role','status');
    const mapStatus=el('p');mapStatus.setAttribute('role','status');
    const updateMapStatus=()=>{mapStatus.textContent=state.scenario?'三個檔案已載入。':'請選擇包含 SINARIO.DAT、MMAP.MAP、ICONGRF.DAT 的遊戲資料夾。';};
    const errors=el('div');errors.className='wd-editor-errors';errors.setAttribute('aria-live','polite');
    const panel=el('div');panel.className='wd-editor';
    const allIssues=()=>state.scenario?[...state.scenario.validate(state.world),...state.drafts.values()].filter(e=>e.message):[];
    function mark() {
      const issues=state.checked?allIssues():[...state.drafts.values()];
      for(const input of panel.querySelectorAll('[data-field]')) {
        const issue=issues.find(e=>e.token===input.dataset.field);
        input.setAttribute('aria-invalid',String(Boolean(issue)));input.title=issue?.message||'';
      }
      errors.replaceChildren();
      if(issues.length) {
        errors.append(el('p',`有 ${issues.length} 項設定需要修正。`));
        const list=el('ul');errors.append(list);
        for(const issue of issues) {
          const li=el('li'),target=issue.table==='chapter'?'劇本名稱':issue.table==='map'?'地圖':`${schemas[issue.table]?.label||'資料'} ${issue.id}`;
          li.append(button(`${state.scenario.title(issue.chapter)} · ${target}：${issue.message}`,()=>{
            state.chapter=issue.chapter;state.table=issue.table==='chapter'?'characters':issue.table;state.query='';paint();
            const field=panel.querySelector(`[data-field="${issue.token}"]`);field?.focus();field?.scrollIntoView({block:'center'});
          }));list.append(li);
        }
      }
      status.textContent=!state.scenario?'請選擇遊戲資料夾。':issues.length?'請修正紅標欄位後再下載。':state.scenario.changed?'內容已修改。':'劇本已載入。';
    }
    function edit(input,chapter,table,id,key,action) {
      const token=`${chapter}:${table}:${id}:${key}`;input.dataset.field=token;
      const draft=state.drafts.get(token);if(draft)input.value=draft.value;
      input.addEventListener('change',()=>{
        try {const refresh=action(input.value);state.drafts.delete(token);if(refresh===true){paint();return;}}
        catch(e){state.drafts.set(token,{chapter,table,id,key,token,value:input.value,message:e.message});}
        mark();
      });
    }
    function downloadFile(bytes,name) {
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    const downloadMap=button('檢查並下載整包',async()=>{
      if(!state.scenario || !state.world){status.textContent='請先載入劇本與地圖。';return;}
      state.scenario.clearInactiveDiplomacy();state.checked=true;mark();if(allIssues().length)return;
      // Snapshot all files together before the asynchronous asset requests.
      const map=state.world.export(),scenario=state.scenario.exportChecked(state.world),world=new WorldMap(map),icon=state.icon.slice(),mapChanged=state.world.tiles.some((v,i)=>v!==state.world.initial[i]),generation=state.generation;
      downloadMap.disabled=true;
      try{
        const [mdl,palette]=await Promise.all(['tiles','palette'].map(async name=>{
          const response=await fetch(`assets/games/wdragon/minimap-${name}.dat`);if(!response.ok)throw new Error('小地圖資料載入失敗，請重試。');return response.arrayBuffer();
        }));
        if(generation!==state.generation)return;
        const minimap=mapChanged?buildMinimap(world,icon,mdl,palette):icon;
        downloadFile(mapArchive([['MMAP.MAP',map],['ICONGRF.DAT',minimap],['SINARIO.DAT',scenario]]),'WDRAGON.zip');
        status.textContent='整包已下載，請解壓縮後將三個檔案一起放入遊戲資料夾。';
      }catch(e){status.textContent=e.message;}finally{downloadMap.disabled=!state.scenario || !state.world;}
    });
    const reset=button('還原全部',()=>{
      if(!state.scenario)return;state.generation++;state.scenario.reset();state.world.reset();state.drafts.clear();state.checked=false;
      state.chapter=0;state.table='characters';state.query='';state.mapCity=0;state.tile=0;updateMapStatus();paint();
    });
    controls.append(label,downloadMap,reset);parent.append(controls,status,mapStatus,errors,panel);updateMapStatus();
    function paint() {
      panel.replaceChildren();reset.disabled=!state.scenario;downloadMap.disabled=!state.scenario || !state.world;if(!state.scenario){mark();return;}
      const model=state.scenario,c=state.chapter,filter=el('div');filter.className='wd-controls';
      const chapters=select(Array.from({length:4},(_,i)=>[i,model.title(i)]),c,'劇本');
      const tables=select([...Object.entries(schemas).map(([k,s])=>[k,s.label]),['map','地圖']],state.table,'資料種類');
      chapters.addEventListener('change',()=>{state.chapter=Number(chapters.value);paint();});tables.addEventListener('change',()=>{state.table=tables.value;state.query='';paint();});
      filter.append(chapters,tables);panel.append(filter);
      const title=el('input');title.value=model.title(c);title.setAttribute('aria-label','劇本名稱');
      const titleLabel=el('label','劇本名稱');titleLabel.append(title);filter.append(titleLabel);
      edit(title,c,'chapter',0,'name',value=>{model.renameChapter(c,value);chapters.options[c].textContent=model.title(c);});
      const cloneSource=select(Array.from({length:4},(_,i)=>[i,model.title(i)]),c,'複製來源劇本');
      const cloneTarget=select(Array.from({length:4},(_,i)=>[i,model.title(i)]),(c+1)%4,'覆蓋目標劇本');
      const details=el('details'),summary=el('summary','複製劇本');details.append(summary,el('p','原版固定四個劇本；複製會覆蓋所選目標劇本。'),cloneSource,cloneTarget,
        button('複製至目標',()=>{try{model.cloneChapter(Number(cloneSource.value),Number(cloneTarget.value));state.chapter=Number(cloneTarget.value);state.drafts.clear();state.checked=true;paint();}catch(e){status.textContent=e.message;}}));panel.append(details);
      if(state.table==='map'){drawMap(model,c);mark();return;}
      const table=state.table,schema=schemas[table],search=el('input');search.type='search';search.placeholder='搜尋姓名';search.setAttribute('aria-label','搜尋姓名');search.value=state.query;
      filter.append(search);
      if(table!=='cities')filter.append(button(`新增${schema.label}`,()=>{try{model.add(c,table);state.query='';state.checked=true;paint();}catch(e){status.textContent=e.message;}}));
      panel.append(el('p',table==='cities'?'修改座標會同步搬移城池圖塊、銜接道路並更新四個劇本；地圖道路接通後會同步相鄰城池。':table==='factions'?'勢力名稱使用君主姓名；新增勢力後請設定君主、首都及所屬關係。':'新增武將會使用空槽；刪除後，引用該武將的欄位必須重新設定。'));
      const output=el('div');output.className='wd-table-scroll';panel.append(output);
      function rows() {
        output.replaceChildren();const grid=el('table');grid.className='wd-table';const head=el('thead'),hr=el('tr');
        for(const name of ['遊戲內 ID',table==='factions'?'勢力名稱（君主姓名）':schema.label,...schema.fields.map(f=>f[1]),...(table==='cities'?[]:['操作'])])hr.append(el('th',name));
        head.append(hr);grid.append(head);const body=el('tbody');grid.append(body);output.append(grid);
        for(const id of model.ids(c,table)) {
          const name=model.name(c,table,id);if(!name.includes(state.query))continue;
          const row=el('tr'),nameCell=el('td'),nameInput=el('input');nameInput.value=name;nameInput.setAttribute('aria-label',`${schema.label} ${id} 名稱`);nameCell.append(nameInput);
          edit(nameInput,c,table,id,'name',value=>model.rename(c,table,id,value));row.append(el('td',id),nameCell);body.append(row);
          for(const f of schema.fields) {
            const reference=['flag','faction','owner','character','city','neighbor'].includes(f[7]),current=model.read(c,table,id,f[0]);
            let input;
            if(reference) {
              const kind=f[7]==='character'?'characters':f[7]==='city' || f[7]==='neighbor'?'cities':'factions';
              const empty=f[7]==='flag'?[[0,'否'],[1,'是']]:f[7]==='faction'?[[255,'未指定']]:f[7]==='owner'?(table==='cities'?[[24,'中立']]:[[255,'無所屬'],[24,'中立']]):[[255,'未設定'],...(f[0]==='strategist'?[[127,'未任命']]:[])];
              const labelFor=i=>kind==='factions'?model.name(c,kind,i):`${i} · ${model.name(c,kind,i)}`;
              const currentLabel=empty.find(([v])=>v===current)?.[1] || (model.ids(c,kind).includes(current)?labelFor(current):`不存在的項目 ${current}`);
              // Keep only the selected option until interaction: city tables otherwise
              // create over 170,000 native option nodes before the first paint.
              input=select([[current,currentLabel]],current,`${name} ${f[1]}`);
              const expand=()=>{
                const value=Number(input.value),options=[...empty,...(f[7]==='flag'?[]:model.ids(c,kind).map(i=>[i,labelFor(i)]))];
                if(!options.some(([v])=>v===value))options.push([value,`不存在的項目 ${value}`]);
                const fragment=document.createDocumentFragment();
                for(const [v,t] of options){const option=el('option',t);option.value=v;fragment.append(option);}
                input.replaceChildren(fragment);input.value=value;
              };
              input.addEventListener('focus',expand);input.addEventListener('pointerdown',expand);
            } else {input=el('input');input.type='number';input.min=f[4];input.max=f[5];input.step=f[6]||1;input.value=current;input.style.width='7em';input.setAttribute('aria-label',`${name} ${f[1]}`);}
            edit(input,c,table,id,f[0],value=>{if(value==='')throw new Error('請輸入設定值。');if(table==='cities' && f[0].startsWith('neighbor')){setNeighbor(model,state.world,c,id,f[0],Number(value));state.checked=true;return true;}if(table==='cities' && ['x','y'].includes(f[0]))moveCity(model,state.world,id,f[0]==='x'?Number(value):model.read(c,table,id,'x'),f[0]==='y'?Number(value):model.read(c,table,id,'y'));else model.write(c,table,id,f[0],Number(value));});
            const cell=el('td');cell.append(input);row.append(cell);
          }
          if(table!=='cities'){const cell=el('td');cell.append(button('刪除',()=>{model.remove(c,table,id);for(const token of state.drafts.keys())if(token.startsWith(`${c}:${table}:${id}:`))state.drafts.delete(token);state.checked=true;paint();}));row.append(cell);}
        }
        mark();
      }
      search.addEventListener('input',()=>{state.query=search.value.trim();rows();});rows();
    }
    function drawMap(model,c) {
      const toolbar=el('div');toolbar.className='wd-controls';
      const selected=select(model.ids(c,'cities').map(i=>[i,`${i} · ${model.name(c,'cities',i)}`]),state.mapCity,'地圖城池');
      const mode=select([['move','搬移城池'],['pan','移動視野'],['connect','連接城池'],['disconnect','移除連線'],['paint','繪製圖塊']], 'move','地圖操作');
      toolbar.append(selected,mode);panel.append(toolbar);
      panel.append(el('p','搬移：拖曳城池，或先選城池再點目的地。移除連線：點道路中段，或先選起點再點相連城池，會刪除道路圖塊與四個劇本的雙向連線。繪製圖塊：先在下方圖集中選一格，再點地圖修改道路、地形或城池圖案。'));
      const wrap=el('div');wrap.style.overflow='auto';const canvas=el('canvas');canvas.width=1536;canvas.height=1024;canvas.style.maxWidth='none';canvas.setAttribute('aria-label','城池位置與相鄰連線');wrap.append(canvas);panel.append(wrap);
      const context=canvas.getContext('2d'),image=new Image(),atlas=new Image();image.src='assets/games/wdragon/world-preview.png';atlas.src='assets/games/wdragon/tiles.png';
      wrap.className='wd-editor-map';canvas.style.imageRendering='pixelated';canvas.style.display='block';
      let zoom=1,bufferScale=1;const levels=[.25,.5,1,2,4,8],zoomLabel=el('output','100%');zoomLabel.setAttribute('aria-label','地圖縮放比例');
      function setZoom(value,anchorX=wrap.clientWidth/2,anchorY=wrap.clientHeight/2) {
        const next=Math.max(.25,Math.min(8,value)),x=(wrap.scrollLeft+anchorX)/zoom,y=(wrap.scrollTop+anchorY)/zoom;
        zoom=next;canvas.style.width=`${1536*zoom}px`;canvas.style.height=`${1024*zoom}px`;
        const scale=Math.min(4,Math.max(1,zoom));if(scale!==bufferScale){bufferScale=scale;canvas.width=1536*scale;canvas.height=1024*scale;draw();}
        wrap.scrollLeft=x*zoom-anchorX;wrap.scrollTop=y*zoom-anchorY;zoomLabel.textContent=`${Math.round(zoom*100)}%`;
      }
      const stepZoom=direction=>levels[Math.max(0,Math.min(levels.length-1,levels.indexOf(zoom)+direction))];
      toolbar.append(button('縮小',()=>setZoom(stepZoom(-1))),zoomLabel,button('放大',()=>setZoom(stepZoom(1))),button('重設檢視',()=>{setZoom(1);wrap.scrollLeft=wrap.scrollTop=0;}),button('定位所選城池',()=>{const id=Number(selected.value);wrap.scrollLeft=(model.read(c,'cities',id,'x')*4+2)*zoom-wrap.clientWidth/2;wrap.scrollTop=(model.read(c,'cities',id,'y')*4+2)*zoom-wrap.clientHeight/2;}));
      panel.insertBefore(el('p','滾輪以游標位置縮放；選「移動視野」或按住滑鼠中鍵拖曳平移。'),wrap);
      canvas.style.width='1536px';canvas.style.height='1024px';
      let wheelTime=-Infinity;
      wrap.addEventListener('wheel',event=>{event.preventDefault();if(performance.now()-wheelTime<100 || !event.deltaY)return;wheelTime=performance.now();const r=wrap.getBoundingClientRect();setZoom(stepZoom(event.deltaY<0?1:-1),event.clientX-r.left-wrap.clientLeft,event.clientY-r.top-wrap.clientTop);},{passive:false});
      const picker=el('canvas');picker.width=256;picker.height=256;picker.setAttribute('aria-label','選擇地圖圖塊');picker.dataset.field=`0:map:0:tiles`;picker.tabIndex=0;panel.append(el('p','地圖供所有劇本共用；修改後請分別下載劇本檔與地圖檔。'),picker);
      const preview=picker.getContext('2d');
      function drawPicker(){preview.clearRect(0,0,256,256);if(atlas.complete && atlas.naturalWidth)preview.drawImage(atlas,0,0);preview.strokeStyle='#f33';preview.lineWidth=2;preview.strokeRect(state.tile%16*16+1,Math.floor(state.tile/16)*16+1,14,14);}
      picker.addEventListener('click',e=>{const r=picker.getBoundingClientRect();state.tile=Math.min(15,Math.floor((e.clientY-r.top)*16/r.height))*16+Math.min(15,Math.floor((e.clientX-r.left)*16/r.width));drawPicker();});
      picker.addEventListener('keydown',e=>{const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-16,ArrowDown:16};if(e.key in offsets){e.preventDefault();state.tile=Math.max(0,Math.min(255,state.tile+offsets[e.key]));drawPicker();}});
      function draw(){context.setTransform(bufferScale,0,0,bufferScale,0,0);context.clearRect(0,0,1536,1024);context.imageSmoothingEnabled=false;
        if(state.world && atlas.complete && atlas.naturalWidth){for(let y=0;y<256;y++)for(let x=0;x<384;x++){const tile=state.world.tiles[y*384+x];context.drawImage(atlas,tile%16*16,Math.floor(tile/16)*16,16,16,x*4,y*4,4,4);}}
        else if(image.complete && image.naturalWidth)context.drawImage(image,0,0);context.strokeStyle='#ffcd69';context.lineWidth=2;
        if(state.world)for(const edge of state.world.routes().edges){context.beginPath();for(let j=0;j<edge.path.length;j++){const p=edge.path[j],x=p%384*4+2,y=Math.floor(p/384)*4+2;if(j)context.lineTo(x,y);else context.moveTo(x,y);}context.stroke();}
        for(const i of model.ids(c,'cities')){const x=model.read(c,'cities',i,'x')*4+2,y=model.read(c,'cities',i,'y')*4+2;
          context.fillStyle=i===Number(selected.value)?'#f55':'#fff';context.beginPath();context.arc(x,y,5,0,Math.PI*2);context.fill();context.fillStyle='#fff';context.font='12px sans-serif';context.fillText(model.name(c,'cities',i),x+6,y);
        }}
      image.onload=draw;atlas.onload=()=>{draw();drawPicker();};selected.addEventListener('change',()=>{state.mapCity=Number(selected.value);draw();});
      const position=event=>{const r=canvas.getBoundingClientRect();return [Math.min(383,Math.max(0,Math.floor((event.clientX-r.left)*384/r.width))),Math.min(255,Math.max(0,Math.floor((event.clientY-r.top)*256/r.height)))];};
      const finishEdit=()=>{for(const [token,draft] of state.drafts)if(draft.table==='cities' && draft.id===Number(selected.value) && ['x','y'].includes(draft.key))state.drafts.delete(token);state.checked=true;draw();mark();};
      let dragging=null,panning=null,skipClick=false;
      canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
      canvas.addEventListener('pointerdown',event=>{
        if(event.button===1 || mode.value==='pan' && event.button===0){event.preventDefault();panning={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:wrap.scrollLeft,top:wrap.scrollTop};canvas.setPointerCapture(event.pointerId);return;}
        if(mode.value!=='move' || event.button!==0)return;
        const [x,y]=position(event),near=model.ids(c,'cities').find(i=>Math.hypot(model.read(c,'cities',i,'x')-x,model.read(c,'cities',i,'y')-y)<=2);
        if(near===undefined)return;dragging={id:near,pointer:event.pointerId,offsetX:model.read(c,'cities',near,'x')-x,offsetY:model.read(c,'cities',near,'y')-y};selected.value=near;state.mapCity=near;canvas.setPointerCapture(event.pointerId);draw();
      });
      canvas.addEventListener('pointermove',event=>{if(!panning || panning.pointer!==event.pointerId)return;wrap.scrollLeft=panning.left+panning.x-event.clientX;wrap.scrollTop=panning.top+panning.y-event.clientY;});
      canvas.addEventListener('pointerup',event=>{
        if(panning && event.pointerId===panning.pointer){skipClick=event.button===0;panning=null;return;}
        if(!dragging || event.pointerId!==dragging.pointer)return;
        const {id,offsetX,offsetY}=dragging;dragging=null;skipClick=true;
        try{const [x,y]=position(event);moveCity(model,state.world,id,x+offsetX,y+offsetY);finishEdit();}catch(e){status.textContent=e.message;}
      });
      canvas.addEventListener('pointercancel',()=>{dragging=null;panning=null;});
      canvas.addEventListener('click',event=>{
        if(skipClick){skipClick=false;return;}
        if(mode.value==='pan')return;
        const rect=canvas.getBoundingClientRect(),x=Math.min(383,Math.max(0,Math.floor((event.clientX-rect.left)*384/rect.width))),y=Math.min(255,Math.max(0,Math.floor((event.clientY-rect.top)*256/rect.height))),id=Number(selected.value);
        try{
          let removed=null;
          if(mode.value==='paint')paintTile(model,state.world,id,x,y,state.tile);
          else if(mode.value==='move')moveCity(model,state.world,id,x,y);
          else {
            const near=model.ids(c,'cities').map(i=>[i,Math.hypot(model.read(c,'cities',i,'x')-x,model.read(c,'cities',i,'y')-y)]).sort((a,b)=>a[1]-b[1])[0];
            if(mode.value==='disconnect'){const j=near[1]<=4?[0,1,2,3].find(j=>model.read(c,'cities',id,`neighbor${j}`)===near[0]):undefined;if(j!==undefined){setNeighbor(model,state.world,c,id,`neighbor${j}`,255);removed={from:id,to:near[0]};}else removed=removeRoadAt(model,state.world,x,y);}else throw new Error('請使用「繪製圖塊」接通道路，雙向連線會自動同步。');
          }
          finishEdit();
          if(removed)status.textContent=`已移除${model.name(c,'cities',removed.from)}—${model.name(c,'cities',removed.to)}的道路圖塊與四個劇本的雙向連線。`;
        }catch(e){status.textContent=e.message;}
      });draw();drawPicker();
    }
    upload.addEventListener('change',async()=>{
      const files=Array.from(upload.files);if(!files.length)return;const generation=++state.generation;
      try{
        const selected=new Map(),names=['SINARIO.DAT','MMAP.MAP','ICONGRF.DAT'];
        for(const file of files){
          const name=file.name.toUpperCase(),path=file.webkitRelativePath;
          // Ignore unrelated files and nested backup folders; use the selected directory itself.
          if(!names.includes(name) || (path && path.split('/').length!==2))continue;
          if(selected.has(name))throw new Error(`重複的檔案：${name}`);selected.set(name,file);
        }
        const missing=names.filter(name=>!selected.has(name));
        if(missing.length)throw new Error(`遊戲資料夾缺少：${missing.join('、')}。`);
        const [input,map,icon,reference]=await Promise.all([
          ...names.map(name=>selected.get(name).arrayBuffer()),
          state.reference || fetch('assets/games/wdragon/routes.json').then(response=>{if(!response.ok)throw new Error('路網檢查資料載入失敗，請重試。');return response.json();})
        ]);
        const model=new Scenario(input),world=new WorldMap(map);
        if(icon.byteLength!==47776)throw new Error('ICONGRF.DAT 格式或長度不正確。');
        model.referenceNetwork=reference;if(generation!==state.generation)return;
        // Commit together only after all three files parse successfully; do not
        // syncMap here because loading must preserve the uploaded scenario bytes.
        state.reference=reference;state.world=world;state.icon=new Uint8Array(icon);state.scenario=model;state.chapter=0;state.table='characters';state.query='';state.mapCity=0;state.tile=0;state.drafts.clear();state.checked=false;updateMapStatus();paint();
      }
      catch(e){if(generation===state.generation)status.textContent=e.message;}
    });paint();
  }
  globalThis.WdragonEditor={Scenario,WorldMap,schemas,render,encode,buildMinimap,mapArchive,analyzeRoutes,moveCity,paintTile,syncMap,setNeighbor,removeRoadAt};
})();
