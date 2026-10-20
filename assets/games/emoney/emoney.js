(() => {
  'use strict';
  const base='assets/games/emoney/';
  const tabs={overview:'首頁',heroes:'主角',units:'兵種',items:'物品與卡片',spells:'技能',cities:'領地',maps:'地圖',chapters:'章節與結局',dialogue:'對話',art:'劇情畫面'};
  let data,chapter=0,pending;
  const states=new Map();
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function picture(path,alt,cls=''){const im=node('img',undefined,cls);im.src=base+path;im.alt=alt;im.loading='lazy';return im;}
  function table(parent,rows,columns,key){
    const state=states.get(key)||{column:-1,direction:1};states.set(key,state);
    const wrap=node('div',undefined,'wd-table-scroll'),t=node('table',undefined,'wd-table'),head=node('thead'),tr=node('tr'),body=node('tbody');
    const collator=new Intl.Collator('zh-Hant',{numeric:true});
    const refresh=()=>{
      body.replaceChildren();const ordered=rows.map((r,i)=>({r,i}));
      if(state.column>=0)ordered.sort((a,b)=>{const get=columns[state.column][2]||columns[state.column][1],x=get(a.r),y=get(b.r);return (typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x??''),String(y??'')))*state.direction||a.i-b.i;});
      [...tr.children].forEach((th,i)=>{const active=state.column===i;th.setAttribute('aria-sort',active?(state.direction===1?'ascending':'descending'):'none');th.firstChild.textContent=columns[i][0]+(active?(state.direction===1?' ↑':' ↓'):' ↕');});
      ordered.forEach(({r})=>{const row=node('tr');columns.forEach(([,get])=>{const td=node('td'),v=get(r);if(v instanceof Node)td.append(v);else td.textContent=v??'—';row.append(td);});body.append(row);});
    };
    columns.forEach(([label],i)=>{const th=node('th'),button=node('button',label);th.scope='col';button.type='button';button.setAttribute('aria-label',label+'排序');button.addEventListener('click',()=>{state.direction=state.column===i?-state.direction:1;state.column=i;refresh();});th.append(button);tr.append(th);});head.append(tr);t.append(head,body);wrap.append(t);parent.append(wrap);refresh();
  }
  function searchable(parent,rows,columns,key){
    const controls=node('div',undefined,'wd-controls'),label=node('label','搜尋'),input=node('input'),count=node('span'),output=node('div');input.type='search';input.id='em-search';label.htmlFor=input.id;input.placeholder='名稱或內容';
    const refresh=()=>{output.replaceChildren();const query=input.value.trim(),filtered=rows.filter(r=>JSON.stringify(r).includes(query));count.textContent=`${filtered.length} 筆`;table(output,filtered,columns,key);};input.addEventListener('input',refresh);controls.append(label,input,count);parent.append(controls,output);refresh();
  }
  function picker(parent,id,labelText,choices,value,change){const controls=node('div',undefined,'wd-controls'),label=node('label',labelText),select=node('select');select.id=id;label.htmlFor=id;choices.forEach(([value,text])=>{const option=node('option',text);option.value=value;select.append(option);});select.value=value;select.addEventListener('change',()=>change(select.value));controls.append(label,select);parent.append(controls);return select;}
  const troops=r=>r.troops.map(t=>`${t.name} LV ${t.level}`).join('、')||'—';
  const stats=(hero=false)=>[['基礎體力',r=>r.hp],['體力成長',r=>r.hpGrowth],['基礎精力',r=>r.mp],['精力成長',r=>r.mpGrowth],[hero?'基礎力量':'基礎攻擊',r=>hero?r.strength:r.attack],[hero?'力量成長':'攻擊成長',r=>hero?r.strengthGrowth:r.attackGrowth],[hero?'基礎敏捷':'基礎防禦',r=>hero?r.dexterity:r.defence],[hero?'敏捷成長':'防禦成長',r=>hero?r.dexterityGrowth:r.defenceGrowth],['基礎智慧',r=>r.intelligence],['智慧成長',r=>r.intelligenceGrowth],['運氣',r=>r.luck]];
  window.renderEmoney=async function(){
    const route=location.hash.split('/')[1],tab=Object.hasOwn(tabs,route)?route:'overview';document.title=`灰灰的老遊戲資料館 · 魔島大富翁 · ${tabs[tab]}`;
    document.querySelectorAll('[data-em-tab]').forEach(a=>{if(a.dataset.emTab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});const root=document.getElementById('em-content');
    if(!data){root.textContent='載入遊戲資料…';try{pending??=fetch(base+'data.json').then(r=>{if(!r.ok)throw Error();return r.json();});data=await pending;}catch{pending=null;root.textContent='遊戲資料載入失敗。';return;}if(location.hash.startsWith('#emoney'))window.renderEmoney();return;}
    root.replaceChildren();if(tab==='overview'){const figure=node('figure',undefined,'title-art');figure.append(picture(data.title,'魔島大富翁'));root.append(figure);return;}
    root.append(node('h2',tabs[tab]));const content=node('div');if(['heroes','cities','maps','chapters'].includes(tab))picker(root,'em-chapter','章節',data.chapters.map((c,i)=>[i,c.name]),chapter,value=>{chapter=Number(value);renderContent(content,tab);});root.append(content);renderContent(content,tab);
  };
  function renderContent(parent,tab){
    parent.replaceChildren();const c=data.chapters[chapter];
    if(tab==='heroes')searchable(parent,c.heroes,[['主角',r=>picture(r.image,r.name,'em-portrait'),r=>r.name],['姓名',r=>r.name],['初始等級',r=>r.level],['初始金錢',r=>r.gold],...stats(true),['部隊',troops],['習得技能',r=>r.spells.map(s=>`${s.name} LV ${s.level}`).join('、')||'—']],'heroes');
    else if(tab==='units')searchable(parent,data.units,[['兵種',r=>picture(r.image,r.name,'em-unit'),r=>r.name],['名稱',r=>r.name],...stats(),['命中',r=>r.hit],['迴避',r=>r.evade],['技能',r=>r.skills.join('、')||'—']],'units');
    else if(tab==='items'){
      const output=node('div');let kind='全部';const refresh=()=>{output.replaceChildren();const rows=data.items.filter(r=>kind==='全部'||r.kind===kind);searchable(output,rows,[['圖像',r=>r.image?picture(r.image,r.name,'em-item'):'—',r=>r.name],['名稱',r=>r.name],['價格',r=>r.price],['攻擊加成',r=>r.kind==='裝備'?r.attack:'—'],['命中',r=>r.kind==='裝備'?r.hit:'—'],['防禦加成',r=>r.kind==='裝備'?r.defence:'—'],['迴避加成',r=>r.kind==='裝備'?r.evade:'—'],['效果（待確認）',r=>r.effect||'—']],'items');};picker(parent,'em-item-kind','種類',['全部','裝備','卡片','其他'].map(x=>[x,x]),kind,value=>{kind=value;refresh();});parent.append(output);refresh();
    }else if(tab==='spells'){
      const types={0:'物理',1:'火系',2:'冰系',3:'雷系',4:'法術',5:'毒',6:'炎',7:'冰',8:'特殊',10:'醫療'};searchable(parent,data.spells,[['技能',r=>r.name],['種類',r=>types[r.type]||'待確認'],['精力消耗',r=>r.mp],['範圍',r=>({0:'全體',1:'單體',2:'自己'}[r.range]||'待確認')]],'spells');
    }else if(tab==='cities')searchable(parent,c.cities,[['領地',r=>r.name],['初始等級',r=>r.level],['金額（用途待確認）',r=>r.gold],['城牆',r=>r.wall?'有':'無'],['護城河',r=>r.river?'有':'無'],['座標',r=>`${r.x}, ${r.y}`],['守軍',troops]],'cities');
    else if(tab==='maps'){
      const figure=node('figure',undefined,'em-map');picker(parent,'em-map-size','顯示',[['full','全圖'],['small','縮圖']],'full',value=>figure.replaceChildren(picture(value==='full'?c.map:c.miniature,c.name+'地圖')));figure.append(picture(c.map,c.name+'地圖'));parent.append(figure);
    }else if(tab==='chapters'){
      const article=node('article',undefined,'formula-card');article.append(node('h3',c.name),node('p',c.introduction,'em-prose'));parent.append(article);c.endings.forEach((text,i)=>{const d=node('details',undefined,'formula-card');d.append(node('summary',`結局 ${i+1}`),node('p',text,'em-prose'));parent.append(d);});
    }else if(tab==='dialogue')searchable(parent,data.dialogue.map(text=>({text})),[['對話',r=>r.text]],'dialogue');
    else if(tab==='art'){
      const figure=node('figure',undefined,'title-art');const refresh=index=>{const r=data.art[index];figure.replaceChildren(picture(r.image,`${r.category} ${r.index}`));};picker(parent,'em-art','畫面',data.art.map((r,i)=>[i,`${r.category} ${r.index}`]),0,refresh);parent.append(figure);refresh(0);
    }
  }
})();
