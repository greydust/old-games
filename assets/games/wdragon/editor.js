/* Original SINARIO.DAT: patch confirmed fields, preserve every other byte. */
(() => {
  const SIZE = 0x56c0, decoder = new TextDecoder('big5');
  const schemas = {
    characters: {label:'武將', start:0x42c0, count:127, stride:32, fields:[
      ['martial','武術',17,1,1,15], ['leadership','統率',18,1,1,15], ['politics','政治',19,1,1,15],
      ['city','城塞戰適性',14,1,0,10,1,'nibble'], ['land','野戰適性',15,1,0,10,1,'nibble'],
      ['sea','海戰適性',16,1,0,10,1,'nibble'], ['suicide','自刎',0,1,0,1,1,'flag'],
      ['delay','登用等待月數',24,1,0,255], ['preferred','預定加入勢力',25,1,0,255,1,'faction']
    ]},
    cities: {label:'城池', start:0x8c0, count:192, stride:32, fields:[
      ['production','生產力',14,2,0,65535], ['production_limit','生產力上限',12,2,0,65535],
      ['growth','上昇率',16,1,-100,100,1,'growth'], ['defense','防災',17,1,0,200],
      ['soldiers','城兵',19,1,0,2550,10], ['soldiers_limit','城兵上限',18,1,0,2550,10],
      ['x','地圖 X',8,2,0,383], ['y','地圖 Y',10,2,0,255]
    ]},
    factions: {label:'勢力', start:128, count:22, stride:64, fields:[
      ['funds','資金',32,3,-8388608,655000],
      ['cavalry','預備騎兵',4,2,0,655000,10], ['archer','預備弓兵',6,2,0,655000,10],
      ['infantry','預備步兵',8,2,0,655000,10], ['capital','首都',3,1,0,191,1,'city']
    ]}
  };
  const decode = bytes => decoder.decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0))).trim();
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
      return table==='factions' ? this.name(chapter,'characters',this.bytes[a+1]) : decode(this.bytes.subarray(a+2,a+8));
    }
    ids(chapter, table) {
      return Array.from({length:schemas[table].count},(_,i)=>i).filter(i=>table!=='factions' || this.bytes[this.address(chapter,table,i)]>=128);
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
    }
    export() { return this.bytes.slice(); }
    reset() { this.bytes.set(this.original); }
    get changed() { return this.bytes.some((b,i)=>b!==this.original[i]); }
  }
  const state={scenario:null, filename:'SINARIO.DAT', chapter:0, table:'characters', query:'', invalid:new Set(), generation:0};
  function render(parent) {
    const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
    parent.replaceChildren();
    const controls=el('div'); controls.className='wd-controls';
    const uploadLabel=el('label','上傳劇本檔'); const upload=el('input'); upload.type='file'; upload.accept='.dat'; uploadLabel.append(upload);
    const download=el('button','下載劇本檔');download.type='button';
    const reset=el('button','還原上傳內容');reset.type='button';
    controls.append(uploadLabel,download,reset);parent.append(controls);
    const status=el('p');status.setAttribute('role','status');parent.append(status);
    const panel=el('div');parent.append(panel);
    function updateStatus() {
      download.disabled=!state.scenario || state.invalid.size>0;
      reset.disabled=!state.scenario;
      status.textContent=state.invalid.size ? '有尚未修正的設定，請修正後再下載。' : state.scenario ? (state.scenario.changed?'內容已修改。':'劇本已載入。') : '請上傳 SINARIO.DAT。';
    }
    function paint() {
      panel.replaceChildren();updateStatus();if(!state.scenario)return;
      const model=state.scenario, filters=el('div');filters.className='wd-controls';
      const chapter=el('select');chapter.setAttribute('aria-label','劇本');
      for(let i=0;i<4;i++){const o=el('option',model.title(i)||`劇本 ${i+1}`);o.value=i;chapter.append(o);}chapter.value=state.chapter;
      const table=el('select');table.setAttribute('aria-label','資料種類');
      for(const [key,schema] of Object.entries(schemas)){const o=el('option',schema.label);o.value=key;table.append(o);}table.value=state.table;
      const search=el('input');search.type='search';search.placeholder='搜尋姓名';search.setAttribute('aria-label','搜尋姓名');search.value=state.query;
      filters.append(el('span','劇本'),chapter,table,search);panel.append(filters);
      const output=el('div');output.className='wd-table-scroll';panel.append(output);
      function rows() {
        output.replaceChildren();const grid=el('table');grid.className='wd-table';const head=el('thead'),hr=el('tr');
        const schema=schemas[state.table];for(const label of ['遊戲內 ID',schema.label,...schema.fields.map(f=>f[1])])hr.append(el('th',label));head.append(hr);grid.append(head);
        const body=el('tbody');grid.append(body);output.append(grid);
        for(const id of model.ids(state.chapter,state.table)) {
          const name=model.name(state.chapter,state.table,id);if(!name.includes(state.query))continue;
          const row=el('tr');row.append(el('td',id),el('td',name));body.append(row);
          for(const f of schema.fields) {
            const token=`${state.chapter}:${state.table}:${id}:${f[0]}`;
            const cell=el('td'), input=el(['flag','faction','city'].includes(f[7])?'select':'input');
            const c=state.chapter,t=state.table;
            if(input.tagName==='SELECT') {
              const options=f[7]==='flag'?[[0,'否'],[1,'是']]:f[7]==='faction'?[[255,'未指定'],...model.ids(c,'factions').map(i=>[i,model.name(c,'factions',i)])]:model.ids(c,'cities').map(i=>[i,model.name(c,'cities',i)]);
              for(const [value,label] of options){const o=el('option',label);o.value=value;input.append(o);}
            } else { input.type='number';input.min=f[4];input.max=f[5];input.step=f[6]||1;input.style.width='7em'; }
            input.value=model.read(c,t,id,f[0]);input.setAttribute('aria-label',`${name} ${f[1]}`);
            const error=el('span');error.setAttribute('role','alert');
            input.addEventListener('change',()=>{
              try { if(input.value==='')throw new Error('請輸入設定值。');model.write(c,t,id,f[0],Number(input.value));state.invalid.delete(token);input.setCustomValidity('');error.textContent=''; }
              catch(e){state.invalid.add(token);input.setCustomValidity(e.message);error.textContent=e.message;}
              updateStatus();
            });cell.append(input,error);row.append(cell);
          }
        }
      }
      // Invalid edits are discarded when leaving the current grid; model retains last valid values.
      function switchGrid(){state.invalid.clear();paint();}
      chapter.addEventListener('change',()=>{state.chapter=Number(chapter.value);switchGrid();});
      table.addEventListener('change',()=>{state.table=table.value;state.query='';switchGrid();});
      search.addEventListener('input',()=>{state.query=search.value.trim();state.invalid.clear();rows();updateStatus();});rows();
    }
    upload.addEventListener('change',async()=>{
      const file=upload.files[0];if(!file)return;const generation=++state.generation;
      try { const model=new Scenario(await file.arrayBuffer());if(generation!==state.generation)return;state.scenario=model;state.filename=file.name;state.chapter=0;state.invalid.clear();paint(); }
      catch(e){if(generation===state.generation){updateStatus();status.textContent=e.message;}}
    });
    download.addEventListener('click',()=>{
      if(!state.scenario || state.invalid.size)return;
      const url=URL.createObjectURL(new Blob([state.scenario.export()],{type:'application/octet-stream'}));
      const a=el('a');a.href=url;a.download=state.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    reset.addEventListener('click',()=>{state.scenario.reset();state.invalid.clear();paint();});
    state.invalid.clear();paint();
  }
  globalThis.WdragonEditor={Scenario,schemas,render};
})();
