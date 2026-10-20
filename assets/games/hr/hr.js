/* HR archive viewer. Only exported game content is rendered. */
(() => {
  let data, pending;
  const tabs = {overview:'首頁', heroes:'我方', troops:'兵種', enemies:'敵方', armies:'部隊編成', equipment:'物品裝備', formations:'陣形', factions:'勢力', goods:'交易品', quests:'任務事件', countries:'國家', locations:'據點', maps:'地圖', dialogue:'對話', formulas:'公式', endings:'結局'};
  const root = () => document.getElementById('hr-content');
  function node(tag, text, cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
  function picture(src,alt,cls) { const n=node('img',undefined,cls); n.src='assets/games/hr/'+src; n.alt=alt; n.loading='lazy'; return n; }
  function note(parent,text) {parent.append(node('p',text,'data-note'));}
  function name(r) {return r.name+(r.nameUnconfirmed?'（字元待確認）':'');}
  const sortStates = new Map();
  const collator = new Intl.Collator('zh-Hant', {numeric:true});
  function table(parent, records, columns) {
    const key=location.hash+':'+columns.map(c=>c[0]).join('|');
    const sorting=sortStates.get(key)||{column:-1,direction:1};sortStates.set(key,sorting);
    const wrap=node('div',undefined,'wd-table-scroll'),t=node('table',undefined,'wd-table'),head=node('thead'),tr=node('tr'),body=node('tbody');
    const rows=records.map((record,index)=>({index,values:columns.map(([,get])=>get(record))}));
    const value=v=>v instanceof Node?(v instanceof HTMLImageElement?v.alt:v.textContent):v;
    const refresh=()=>{
      const left=wrap.scrollLeft;body.replaceChildren();
      const ordered=[...rows];
      if(sorting.column>=0)ordered.sort((a,b)=>{
        const x=value(a.values[sorting.column]),y=value(b.values[sorting.column]);
        if(x===null||x===undefined||x==='—')return y===null||y===undefined||y==='—'?a.index-b.index:1;
        if(y===null||y===undefined||y==='—')return -1;
        return (typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y)))*sorting.direction||a.index-b.index;
      });
      [...tr.children].forEach((th,i)=>{const active=sorting.column===i;th.setAttribute('aria-sort',active?(sorting.direction===1?'ascending':'descending'):'none');th.firstChild.textContent=columns[i][0]+(active?(sorting.direction===1?' ↑':' ↓'):' ↕');});
      ordered.forEach(row=>{const r=node('tr');row.values.forEach(v=>{const td=node('td');if(v instanceof Node)td.append(v);else td.textContent=v??'—';r.append(td);});body.append(r);});wrap.scrollLeft=left;
    };
    columns.forEach(([title],i)=>{const th=node('th'),button=node('button');th.scope='col';button.type='button';button.setAttribute('aria-label',title+'排序');button.addEventListener('click',()=>{sorting.direction=sorting.column===i?-sorting.direction:1;sorting.column=i;refresh();});th.append(button);tr.append(th);});
    head.append(tr);t.append(head,body);wrap.append(t);parent.append(wrap);refresh();
  }
  function searchable(parent,records,columns,extra=()=>true) {
    const label=node('label','搜尋名稱'),search=node('input'); search.type='search';search.id='hr-search';label.htmlFor=search.id;search.placeholder='搜尋名稱';
    const output=node('div');const refresh=()=>{output.replaceChildren();const q=search.value.trim();table(output,records.filter(r=>r.name.includes(q)&&extra(r)),columns);};
    search.addEventListener('input',refresh);parent.append(label,search,output);refresh();return refresh;
  }
  function capabilityColumns() {return [['名稱',name],['基礎體力',r=>r.hp],['基礎射擊',r=>r.shoot],['基礎防禦',r=>r.defence],['體力上限',r=>r.maxHp],['射擊上限',r=>r.maxShoot],['防禦上限',r=>r.maxDefence],['交易',r=>r.trading],['公演',r=>r.performance],['建築',r=>r.building],['交易上限',r=>r.maxTrading],['公演上限',r=>r.maxPerformance],['建築上限',r=>r.maxBuilding]];}
  function tradePrices(base,multiplier,trading) {
    const adjusted=Math.trunc(base*multiplier/100),buy=Math.max(1,adjusted-Math.trunc(adjusted*trading/200));
    const discounted=Math.trunc(adjusted*8/10);
    return {buy,sell:Math.max(1,Math.min(buy,discounted+Math.trunc(discounted*trading/200)))};
  }
  function marketPicker(parent,onChange) {
    const wrap=node('div',undefined,'hr-market-picker'),label=node('label','市場'),button=node('button'),list=node('div',undefined,'hr-market-options');
    label.id='hr-market-label';button.id='hr-market';button.type='button';button.setAttribute('role','combobox');button.setAttribute('aria-labelledby',label.id);button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-controls','hr-market-options');
    list.id='hr-market-options';list.setAttribute('role','listbox');list.setAttribute('aria-labelledby',label.id);list.hidden=true;
    let selected=0;const options=[];
    const close=()=>{list.hidden=true;button.setAttribute('aria-expanded','false');};
    const show=index=>{list.hidden=false;button.setAttribute('aria-expanded','true');options[index].focus();options[index].scrollIntoView({block:'nearest'});};
    const choose=index=>{selected=index;button.textContent=data.markets[index].name;options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));close();button.focus();onChange(index);};
    data.markets.forEach((m,i)=>{const option=node('button',m.name);option.type='button';option.setAttribute('role','option');option.setAttribute('aria-selected',String(i===selected));option.tabIndex=-1;option.addEventListener('click',()=>choose(i));option.addEventListener('keydown',event=>{
      let next=i;if(event.key==='ArrowDown')next=Math.min(i+1,options.length-1);else if(event.key==='ArrowUp')next=Math.max(i-1,0);else if(event.key==='Home')next=0;else if(event.key==='End')next=options.length-1;else if(event.key==='Escape'){event.preventDefault();close();button.focus();return;}else if(event.key==='Tab'){close();return;}else return;
      event.preventDefault();options[next].focus();options[next].scrollIntoView({block:'nearest'});
    });options.push(option);list.append(option);});
    button.textContent=data.markets[0].name;button.addEventListener('click',()=>list.hidden?show(selected):close());button.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?options.length-1:selected); }else if(event.key==='Escape')close();});
    wrap.addEventListener('focusout',event=>{if(!wrap.contains(event.relatedTarget))close();});wrap.append(label,button,list);parent.append(wrap);
  }
  function trade(parent) {
    const controls=node('div',undefined,'hr-trade-controls'),ability=node('input');let marketIndex=0;
    ability.id='hr-trading';ability.type='number';ability.min='0';ability.max='162';ability.step='1';ability.value='0';
    marketPicker(controls,index=>{marketIndex=index;refresh();});
    const field=node('div',undefined,'hr-trading-field'),al=node('label','交易能力');al.htmlFor=ability.id;field.append(al,ability);controls.append(field);parent.append(controls);
    note(parent,'基本價格固定，各據點按當地倍率計算買賣價；部分市場的倍率相同。買價為向市場購入，賣價為出售給市場。庫存列為初始庫存；每人每種交易品最多持有 100 個。');
    const output=node('div');parent.append(output);
    const refresh=()=>{if(!ability.checkValidity())return;output.replaceChildren();const m=data.markets[marketIndex],skill=+ability.value;
      output.append(node('h3',m.name));
      const same=data.markets.filter(other=>other!==m&&other.goods.every((g,i)=>g.multiplier===m.goods[i].multiplier));
      if(same.length)note(output,'相同買賣價：'+same.map(other=>other.name).join('、'));
      table(output,data.goods.map((g,i)=>({...g,...m.goods[i],...tradePrices(g.price,m.goods[i].multiplier,skill)})),[['交易品',r=>r.name],['基本價格（Ｇ）',r=>r.price],['當地倍率（%）',r=>r.multiplier],['買價（Ｇ）',r=>r.buy],['賣價（Ｇ）',r=>r.sell],['初始庫存',r=>r.initialStock]]);
    };ability.addEventListener('input',refresh);refresh();
    const details=node('details');details.append(node('summary','買賣價格公式'));tradeFormulas(details);parent.append(details);
  }
  function tradeFormulas(parent) {
    const card=node('article',undefined,'formula-card');card.append(node('h3','交易品買賣價格'),node('pre','當地價格 = 捨去小數(基本價格 × 當地倍率 ÷ 100)\n買價 = 當地價格 − 捨去小數(當地價格 × 交易能力 ÷ 200)\n賣價基數 = 捨去小數(當地價格 × 8 ÷ 10)\n賣價 = 賣價基數 ＋ 捨去小數(賣價基數 × 交易能力 ÷ 200)\n買價與賣價最低為 1Ｇ；賣價不高於買價'),node('p','例如拜亞蘭斯城的金屬針：基本價 480Ｇ、倍率 170%。交易能力 0 時買價 816Ｇ、賣價 652Ｇ；交易能力 20 時買價 735Ｇ、賣價 717Ｇ。交易能力包含符合條件的裝備加成。'));parent.append(card);
  }
  function formulas(parent) {
    const cards=[
      ['能力成長','能力 = 基礎能力\n每滿 100 經驗：能力 = 向零取整(能力 × 150 ÷ 100)\n剩餘經驗：能力 = 向零取整(能力 × (100 + 向零取整(剩餘經驗 ÷ 2)) ÷ 100)\n最後不超過該能力上限','每 100 經驗會再乘 1.5 倍，每一步捨去小數。例如基礎能力 10：0 經驗為 10、100 為 15、200 為 22、300 為 33。剩餘不足 100 的經驗再按上式加成，最後受能力上限限制。適用於體力、射擊、防禦、交易、公演與建築。'],
      ['一般射擊傷害','威力 = 向零取整(武器攻擊 × 射擊 ÷ (目標防禦 + 防具防禦 + 1))\n傷害 = 向零取整(威力 × 隨機整數[80, 99] ÷ 40)\n乘除中間值非零、傷害為零時，傷害改為 1\n20% 機會：傷害 = 向零取整(傷害 × 隨機整數[150, 199] ÷ 100)','此為命中後的傷害分支。部分同伴兵種受到致命傷害時保留 1 體力；已剩 1 體力者仍可被擊倒。數值運算使用 16 位元有號整數，中間乘法可能溢位。'],
      ['砲擊基礎傷害','基礎傷害 = 向零取整(向零取整(攻擊 × 隨機整數[8, 11] ÷ 10) ÷ (向零取整(防禦 ÷ 10) + 1))\n負值改為 1；超過 999 改為 999','砲擊與攻城分支共用此計算。後續仍有距離、地形及攻擊種類的修正。'],
      ['砲擊距離修正','距離 0–1：100%\n距離 2–3：95%\n距離 4–5：90%\n距離 6–7：85%\n距離 8–9：80%\n其他距離：75%\n修正傷害 = 向零取整(基礎傷害 × 距離係數 ÷ 100) + 1',''],
    ];
    tradeFormulas(parent);
    cards.forEach(([title,formula,description])=>{const card=node('article',undefined,'formula-card');card.append(node('h3',title),node('pre',formula));if(description)card.append(node('p',description));parent.append(card);});
  }
  function render() {
    const parent=root(); if(!parent||!data)return;
    const requested=location.hash.split('/')[1]||'overview'; const tab=tabs[requested]?requested:'overview';
    document.querySelectorAll('[data-hr-tab]').forEach(a=>{if(a.dataset.hrTab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    parent.replaceChildren(); document.title='灰灰的老遊戲資料館 · 高報酬戰將 · '+(tabs[tab]||tabs.overview);
    if(tab==='overview') {parent.append(picture('title.png','高報酬戰將標題畫面','hr-title'));const opening=node('details',undefined,'hr-opening');opening.append(node('summary','序章'),node('p',data.opening));parent.append(opening);return;}
    parent.append(node('h2',tabs[tab]||tabs.overview));
    if(tab==='heroes') {
      const grid=node('div',undefined,'hr-profile-grid');data.heroes.forEach(h=>{const card=node('article',undefined,'hr-profile');const unit=data.troops[h.unitId];card.append(picture(`images/face.mrg/${String(h.portrait).padStart(4,'0')}.png`,h.name,'hr-face'),node('h3',h.name),node('p',h.group));const stats=node('dl',undefined,'hr-stats');capabilityColumns().slice(1).forEach(([title,get])=>{const pair=node('div');pair.append(node('dt',title),node('dd',get(unit)));stats.append(pair);});card.append(stats);grid.append(card);});parent.append(grid);
      data.profiles.forEach(p=>{const details=node('details',undefined,'hr-profile-text');details.append(node('summary',p.name),picture(p.image,p.name),node('p',p.text));parent.append(details);});
    } else if(tab==='troops'||tab==='enemies') {
      searchable(parent,tab==='enemies'?data.troops.filter(r=>r.id>=29):data.troops,[['圖像',r=>picture(r.image,r.name,'hr-unit')],...capabilityColumns()]);
    } else if(tab==='equipment') {
      const select=node('select');select.setAttribute('aria-label','裝備種類');['全部','武器','防具','物品','戰車','航空機','大砲'].forEach(s=>{const o=node('option',s);select.append(o);});parent.append(select);
      const refresh=searchable(parent,data.equipment,[['圖像',r=>r.image?picture(r.image,r.name,'hr-item'):'—'],['名稱',name],['種類',r=>r.group],['價格（Ｇ）',r=>r.price],['攻擊',r=>r.attack],['防禦',r=>r.defence],['耐久',r=>r.durability],['效果',r=>r.effect||'—']],r=>select.value==='全部'||r.group===select.value);select.addEventListener('change',refresh);
    } else if(tab==='armies') {
      searchable(parent,data.armies,[['部隊',name],['編成',r=>{const counts=new Map();r.members.forEach(m=>counts.set(m.unitId,(counts.get(m.unitId)||0)+1));return [...counts].map(([id,n])=>(data.troops[id]?.name||'待確認')+' × '+n).join('、');}]]);
    } else if(tab==='formations') {
      note(parent,'陣形決定部隊 11 個位置的站位。射擊選擇目標時，在相同目標優先條件下，會以橫向站位與隨機值共同決定攻擊對象。');
      const grid=node('div',undefined,'hr-formation-grid');data.formations.forEach(f=>{const card=node('article',undefined,'formula-card');card.append(node('h3',f.name));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 150 240 180');svg.setAttribute('role','img');svg.setAttribute('aria-label',f.name);f.positions.forEach(([x,y])=>{const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','7');circle.setAttribute('fill','#cfb77d');svg.append(circle);});card.append(svg);grid.append(card);});parent.append(grid);
    } else if(tab==='factions') {
      table(parent,data.factions,[['勢力',r=>r.name]]);
    } else if(tab==='goods') {
      trade(parent);
    } else if(tab==='quests') {
      searchable(parent,data.quests,[['任務事件',r=>r.name],['目標',r=>r.objective],['報酬／物品',r=>r.reward],['觸發條件',r=>r.trigger],['對話',r=>{const details=node('details',undefined,'hr-quest-dialogue');details.append(node('summary','對話'));r.dialogue.forEach(d=>details.append(node('p',d.text+(d.unconfirmed?'（字元待確認）':''))));return details;}]]);
    } else if(tab==='countries') {
      data.countries.forEach(c=>{const card=node('article',undefined,'formula-card');card.append(node('h3',c.name),node('p',c.description));parent.append(card);});
    } else if(tab==='locations') {
      searchable(parent,data.locations,[['據點',name],['商店',r=>r.shops.map(name).join('、')]]);
      const details=node('details');details.append(node('summary','地點說明'));data.placeDescriptions.forEach(r=>{details.append(node('p',r.text+(r.unconfirmed?'（字元待確認）':'')));});parent.append(details);
    } else if(tab==='maps') {
      const select=node('select');select.setAttribute('aria-label','選擇地圖');[{name:'世界地圖',image:'world.png'},...data.maps].forEach((m,i)=>{const o=node('option',m.name);o.value=i;select.append(o);});const figure=node('figure',undefined,'hr-map');const refresh=()=>{const m=[{name:'世界地圖',image:'world.png'},...data.maps][+select.value];figure.replaceChildren(picture(m.image,m.name));};select.addEventListener('change',refresh);parent.append(select,figure);refresh();
    } else if(tab==='dialogue') {
      const select=node('select');select.setAttribute('aria-label','對話種類');[['dialogues','對話'],['rumours','傳聞'],['powerDialogues','勢力對話'],['eventDialogues','事件對話']].forEach(([key,title])=>{const o=node('option',title);o.value=key;select.append(o);});const search=node('input');search.type='search';search.placeholder='搜尋對話';search.setAttribute('aria-label','搜尋對話');const output=node('div',undefined,'hr-dialogues');const refresh=()=>{output.replaceChildren();data[select.value].filter(r=>r.text.includes(search.value.trim())).forEach(r=>output.append(node('p',r.text+(r.unconfirmed?'（字元待確認）':''))));};select.addEventListener('change',refresh);search.addEventListener('input',refresh);parent.append(select,search,output);refresh();
    } else if(tab==='formulas') {formulas(parent);
    } else if(tab==='endings') {const gallery=node('div',undefined,'hr-gallery');data.endings.forEach(r=>gallery.append(picture(r.image,'結局畫面')));parent.append(gallery);const credits=node('details');credits.append(node('summary','製作名單'),picture('credits.png','製作名單','hr-credits'));parent.append(credits);}
  }
  window.renderHr=()=>{
    if(!location.hash.startsWith('#hr'))return;
    if(data){render();return;}
    if(!pending){root().textContent='載入遊戲資料…';pending=fetch('assets/games/hr/data.json').then(r=>{if(!r.ok)throw new Error('load');return r.json();}).then(value=>{data=value;if(location.hash.startsWith('#hr'))render();}).catch(()=>{pending=null;root().textContent='資料載入失敗，請重新整理。';});}
  };
})();
