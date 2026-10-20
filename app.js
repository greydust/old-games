let stageMaps = {};
let enemyLookup = new Map();
let unitLookup = new Map();
let activeUnitGroup = null;
let wdragonData = null;
let wdragonChapter = 0;
const wdragonTabs = {overview:'首頁', characters:'武將', cities:'城池', factions:'勢力', troops:'兵種', formulas:'公式', map:'地圖', editor:'劇本編輯器'};
const wdragonView = {
  characters: {query:'', sorting:{key:'id', direction:1}, scrollLeft:0},
  cities: {query:'', sorting:{key:'id', direction:1}, scrollLeft:0},
  factions: {query:'', sorting:{key:'id', direction:1}, scrollLeft:0},
  map: {cityId:0, scrollLeft:0, scrollTop:0}
};
function renderPage() {
  const [hash, target] = location.hash.split('/id/');
  const isGame = hash.startsWith('#toco') || ['#units-section', '#stages-section'].includes(hash);
  const isWdragon = hash === '#wdragon' || hash.startsWith('#wdragon/');
  const isHr = hash === '#hr' || hash.startsWith('#hr/');
  const tab = hash === '#toco/enemies' ? 'enemies' : hash === '#toco/formulas' ? 'formulas' : hash === '#toco/skills' ? 'skills' : hash === '#toco/units' || hash === '#units-section' ? 'units' : hash === '#toco/stages' || hash === '#stages-section' ? 'stages' : 'overview';
  document.getElementById('home').hidden = isGame || isWdragon || isHr;
  document.getElementById('hr').hidden = !isHr;
  document.getElementById('toco').hidden = !isGame;
  document.getElementById('wdragon').hidden = !isWdragon;
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === (isHr ? 'hr' : isWdragon ? 'wdragon' : isGame ? 'toco' : 'home')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-tab]').forEach(link => {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
  document.title = isGame ? '灰灰的老遊戲資料館 · 精靈幻界 · ' + ({overview:'首頁', units:'兵種', stages:'關卡', enemies:'敵人', skills:'技能', formulas:'公式'}[tab]) : '灰灰的老遊戲資料館';
  if (isWdragon) renderWdragon();
  if (isHr) window.renderHr();
  if (target?.startsWith('unit-')) {
    const family = document.getElementById(target)?.closest('[data-unit-group]');
    if (family) selectUnitGroup(family.dataset.unitGroup);
  }
  if (target && document.getElementById(target)) document.getElementById(target).scrollIntoView();
  else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', renderPage);
renderPage();

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function wdNote(parent, text) { parent.append(element('p', text, 'data-note')); }

function wdTable(parent, records, columns, caption, sorting = null) {
  const wrap = element('div', undefined, 'wd-table-scroll');
  const table = element('table', undefined, 'wd-table');
  if (caption) table.append(element('caption', caption));
  const head = element('thead');
  const row = element('tr');
  const body = element('tbody');
  const headers = [];
  const refresh = () => {
    body.replaceChildren();
    const ordered = [...records];
    if (sorting) ordered.sort((a, b) => {
      const left = a[sorting.key] ?? '', right = b[sorting.key] ?? '';
      const result = typeof left === 'string' ? left.localeCompare(right, 'zh-Hant') : left - right;
      return result * sorting.direction || a.id - b.id;
    });
    headers.forEach(({th, button, label, key}) => {
      const active = sorting.key === key;
      th.setAttribute('aria-sort', active ? (sorting.direction === 1 ? 'ascending' : 'descending') : 'none');
      button.textContent = label + (active ? (sorting.direction === 1 ? ' ↑' : ' ↓') : ' ↕');
    });
    ordered.forEach(record => {
      const tr = element('tr');
      columns.forEach(([, value]) => {
        const td = element('td'); const content = value(record);
        if (content instanceof Node) td.append(content); else td.textContent = content ?? '—';
        tr.append(td);
      });
      body.append(tr);
    });
  };
  columns.forEach(([label, , key]) => {
    const th = element('th'); th.scope = 'col';
    if (sorting && key) {
      const button = element('button', label); button.type = 'button';
      button.setAttribute('aria-label', label + '排序');
      button.addEventListener('click', () => {
        sorting.direction = sorting.key === key ? -sorting.direction : 1;
        sorting.key = key; refresh();
      });
      th.append(button); headers.push({th, button, label, key});
    } else th.textContent = label;
    row.append(th);
  });
  head.append(row); table.append(head, body); wrap.append(table); parent.append(wrap); refresh();
}

function wdSearch(parent, label, choices, update) {
  const view = wdragonView[parent.dataset.wdPage];
  const controls = element('div', undefined, 'wd-controls');
  const searchLabel = element('label', label); searchLabel.htmlFor = 'wd-search';
  const search = element('input'); search.id = 'wd-search'; search.type = 'search'; search.placeholder = label;
  search.value = view.query;
  const sortLabel = element('label', '排序'); sortLabel.htmlFor = 'wd-sort';
  const sort = element('select'); sort.id = 'wd-sort';
  choices.forEach(([key, title]) => { const option = element('option', title); option.value = key; sort.append(option); });
  const output = element('div');
  const refresh = () => {
    view.query = search.value;
    const previous = output.querySelector('.wd-table-scroll');
    if (previous) view.scrollLeft = previous.scrollLeft;
    update(output, search.value.trim(), sort.value);
    const tableScroll = output.querySelector('.wd-table-scroll');
    if (tableScroll) {
      tableScroll.scrollLeft = view.scrollLeft;
      tableScroll.addEventListener('scroll', () => { view.scrollLeft = tableScroll.scrollLeft; });
    }
  };
  search.addEventListener('input', refresh); sort.addEventListener('change', refresh);
  controls.append(searchLabel, search);
  if (choices.length) controls.append(sortLabel, sort);
  parent.append(controls, output); refresh();
}

function renderWdragon() {
  const route = location.hash.split('/')[1] || 'overview';
  const requested = route === 'abilities' ? 'formulas' : route;
  const tab = Object.hasOwn(wdragonTabs, requested) ? requested : 'overview';
  document.title = `灰灰的老遊戲資料館 · 臥龍傳 · ${wdragonTabs[tab]}`;
  document.querySelectorAll('[data-wd-tab]').forEach(link => {
    if (link.dataset.wdTab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (!wdragonData) return;
  const chapter = wdragonData.chapters[wdragonChapter];
  const parent = document.getElementById('wd-content'); parent.replaceChildren();
  parent.dataset.wdPage = tab;
  const chapterControl = document.querySelector('#wd-chapter').closest('.wd-controls');
  chapterControl.hidden = !['characters', 'cities', 'factions', 'map'].includes(tab);
  if (tab === 'editor') {
    WdragonEditor.render(parent);
  } else if (tab === 'overview') {
    const figure = element('figure', undefined, 'title-art');
    const image = element('img'); image.src = 'assets/games/wdragon/title.png'; image.alt = '臥龍傳標題畫面';
    image.width = 640; image.height = 400; figure.append(image); parent.append(figure);
  } else if (tab === 'characters') {
    const sorting = wdragonView.characters.sorting;
    wdSearch(parent, '搜尋武將姓名', [], (output, query) => {
      output.replaceChildren();
      const records = chapter.characters.filter(c => c.name.includes(query));
      wdTable(output, records, [['遊戲內 ID',c=>c.id,'id'],['武將',c=>c.name,'name'],['勢力',c=>c.faction,'faction'],['身分',c=>c.role,'role'],['預定加入勢力',c=>c.preferred_faction || '未指定','preferred_faction'],['武術',c=>c.martial,'martial'],['統率',c=>c.leadership,'leadership'],['政治',c=>c.politics,'politics'],['城塞戰適性',c=>c.city_combat_proficiency,'city_combat_proficiency'],['野戰適性',c=>c.land_combat_proficiency,'land_combat_proficiency'],['海戰適性',c=>c.sea_combat_proficiency,'sea_combat_proficiency'],['自刎',c=>{
        const value = element('span', c.suicide_on_faction_defeat ? '是' : '否');
        value.title = '進入被俘處理且原勢力已滅亡時，是否自刎。';
        return value;
      },'suicide_on_faction_defeat']], '', sorting);
      if (!records.length) output.append(element('p','沒有符合的武將。'));
    });
  } else if (tab === 'cities') {
    const sorting = wdragonView.cities.sorting;
    wdSearch(parent, '搜尋城池或內政官', [], (output, query) => {
      output.replaceChildren();
      const records = chapter.cities.filter(c => c.name.includes(query) || c.administrator?.includes(query));
      wdTable(output, records, [['遊戲內 ID',c=>c.id,'id'],['據點',c=>c.name,'name'],['種類',c=>c.type,'type'],['勢力',c=>c.faction || '—','faction'],['生產力',c=>c.production,'production'],['生產力上限',c=>c.production_limit,'production_limit'],['上昇率',c=>c.growth > 0 ? `+${c.growth}` : c.growth,'growth'],['防災',c=>c.disaster_prevention,'disaster_prevention'],['城兵',c=>c.garrison,'garrison'],['城兵上限',c=>c.garrison_limit,'garrison_limit'],['內政官',c=>c.administrator || '未任命','administrator'],['地圖座標',c=>{
        const a = element('a',`${c.x}, ${c.y}`); a.href = `#wdragon/map/id/city-${c.id}`; return a;
      }]], '', sorting);
      if (!records.length) output.append(element('p','沒有符合的城池。'));
    });
  } else if (tab === 'factions') {
    const sorting = wdragonView.factions.sorting;
    wdSearch(parent, '搜尋君主、軍師或首都', [], (output, query) => {
      output.replaceChildren();
      const records=chapter.factions.filter(f=>[f.name,f.strategist,f.capital].some(value=>value?.includes(query)));
      wdTable(output,records,[['遊戲內 ID',f=>f.id,'id'],['君主',f=>f.name,'name'],['軍師',f=>f.strategist || '未任命','strategist'],['首都',f=>f.capital,'capital'],['資金',f=>`${f.funds} / ${f.funds_limit}`,'funds'],['預備騎兵',f=>f.cavalry_reserve,'cavalry_reserve'],['預備弓兵',f=>f.archer_reserve,'archer_reserve'],['預備步兵',f=>f.infantry_reserve,'infantry_reserve'],['武將數',f=>f.character_count,'character_count'],['據點數',f=>f.city_count,'city_count']],'',sorting);
      if(!records.length)output.append(element('p','沒有符合的勢力。'));
    });
  } else if (tab === 'troops') {
    const cards = element('div',undefined,'unit-cards');
    wdragonData.troop_names.forEach(name => {
      const card = element('article',undefined,'formula-card');
      card.append(element('h2',name));
      card.append(element('p','可設定下個月以後的募集人數。'));
      wdNote(card, '招募費用、速度、射程與地形效果待確認。');
      cards.append(card);
    }); parent.append(cards);
  } else if (tab === 'formulas') {
    const recruitment = element('article',undefined,'formula-card');
    recruitment.append(element('h2','徵兵：城池募集基值'));
    recruitment.append(element('pre', '距離 D = max（|城池 X − 首都 X|，|城池 Y − 首都 Y|）\n距離除數 Q：D ≤ 80 → 2；80 < D ≤ 200 → 3；D > 200 → 4\n基數 A = ⌊⌊生產力 ÷ Q⌋ ÷ 32⌋'));
    recruitment.append(element('pre', '城池 Y < 80：\n  弓兵 = ⌊A ÷ 32⌋\n  步兵 = ⌊A ÷ 4⌋ + ⌊A ÷ 8⌋\n  騎兵 = A − 弓兵 − 步兵\n\n80 ≤ 城池 Y < 150：\n  騎兵 = 弓兵 = ⌊A ÷ 8⌋\n  步兵 = A − 騎兵 − 弓兵\n\n城池 Y ≥ 150：\n  騎兵 = ⌊A ÷ 32⌋\n  弓兵 = ⌊A ÷ 2⌋\n  步兵 = ⌊A ÷ 2⌋ − 騎兵\n\n各兵種募集基值（人）= 上述結果 × 10\n勢力募集基值 = 所屬城池的募集基值合計'));
    recruitment.append(element('p','座標以戰略地圖圖塊為單位，Y 由北往南增加；⌊x⌋ 表示無條件捨去。實際募集受募集設定、資金與預備兵上限等條件限制。'));
    parent.append(recruitment);
    const combat = element('article',undefined,'formula-card');
    combat.append(element('h2','戰鬥：武術、統率與適性'));
    combat.append(element('pre','W = 武術；L = 統率；S = 本次作戰適性\n城塞戰選城塞戰適性；野戰選野戰適性；海戰選海戰適性。\n⌊x⌋ 表示無條件捨去。'));
    combat.append(element('h3','戰術戰鬥'));
    combat.append(element('pre','武將戰術能力基值 = 4W + 2S\n部隊戰術能力基值 = ⌊[3(L + S) + 兵種補正] ÷ 4⌋\n兵種補正：騎兵 30；弓兵 4；步兵 12。'));
    combat.append(element('p','適性每增加 1，武將戰術能力基值增加 2；部隊戰術能力基值約增加 0.75，實際依取整結果而定。這些基值另參與戰鬥判定，並非直接造成的傷亡人數。'));
    combat.append(element('h3','自動結算'));
    combat.append(element('pre','r = 隨機 0～3\nW ≥ L 且 r ≠ 0：C = 2W\nW ≥ L 且 r = 0：C = W − ⌊W ÷ 4⌋ + L\nW < L：C = 2L − ⌊L ÷ 4⌋\n\n能力修正 K = ⌊16C ÷ (16 − S)⌋\n修正後戰力 = ⌊B × K ÷ 1024⌋\nB = 兵力編制加權後再經士氣修正的基數'));
    combat.append(element('p','自動結算的據點交戰選城塞戰適性，軍團交戰固定選野戰適性。適性越高，修正增幅越大；例如 C = 20 時，S = 0／4／8／10 的 K 分別為 20／26／40／53。修正後戰力仍需經雙方比較與後續損失計算。'));
    combat.append(element('h3','自動結算：兵力基數 B'));
    combat.append(element('pre',`騎 = 軍團騎兵人數 ÷ 10
弓 = 軍團弓兵人數 ÷ 10
步 = 軍團步兵人數 ÷ 10
城 = 城兵人數 ÷ 10
M = 士氣（此式以 0～255 計）

野戰雙方：A = 3騎 + 2弓 + 步
城塞戰攻方：A = 2騎 + 弓 + 2步
城塞戰守方：A = 2騎 + 3弓 + 3步 + 城

B = A × ⌊M ÷ 8⌋
乘積超過 65535 時，取除以 65536 的餘數。`));
    combat.append(element('h3','自動結算：勝負與損兵'));
    combat.append(element('pre','戰力較高者為勝方；同值時取比較順序中的第一方。\n\n強方值 = 強方戰力 + 8\n弱方值 = 弱方戰力 + 8\nQ = min（100，⌊8 × 強方值 ÷ 弱方值⌋）\n\n依序處理六個編制，i = 1～6：\n勝方扣兵單位 = 隨機 2～9\n敗方扣兵單位 = 8 +〔隨機 0～255 除以（Q + i）的餘數〕\n每單位 = 10 人'));
    combat.append(element('p','各編制扣至不足時歸零，但雙方第一個編制至少保留 1 單位（10 人）。'));
    combat.append(element('h3','自動結算：士氣'));
    combat.append(element('pre','士氣以 0～255 計。\n\n原士氣 ≥ 100，且戰前兵力 > 0：\n  勝方新士氣 = ⌊原士氣 × 戰後兵力 ÷ 戰前兵力⌋\n  敗方新士氣 = ⌊100 × 戰後兵力 ÷ 戰前兵力⌋\n\n原士氣 < 100，或戰前兵力 = 0 → 新士氣為 0'));
    combat.append(element('p','勝方仍會損兵；士氣歸零時仍會進入潰敗處理。'));
    parent.append(combat);
    const tactical = element('article',undefined,'formula-card');
    tactical.append(element('h2','戰術戰鬥：近戰、射擊與戰後兵力'));
    tactical.append(element('pre','E = 攻擊單位的戰術能力基值\n武將：E = 4 × 武術 + 2 × 適性\n部隊：E = ⌊[3 ×（統率 + 適性）+ 兵種補正] ÷ 4⌋\n場上單位的初始士氣由軍團士氣建立。'));
    tactical.append(element('h3','近戰：攻擊部隊'));
    tactical.append(element('pre','U = 隨機 0～127\n判定值 = U + E\n\n局勢不利：判定值 = max（0，判定值 − 50）\n判定值 ≥ 70 → 成功\n判定值 < 70 → 失敗\n\n成功時扣減目標單位士氣：\n  一般：扣 E\n  局勢有利：扣 min（255，E + 64）\n  攻擊方處於特殊動作狀態時另有加值（動作名稱待確認）。\n目標士氣扣至 0 → 該單位失效'));
    tactical.append(element('h3','近戰：攻擊武將'));
    tactical.append(element('pre','目標士氣 ≤ 1 時，不進行此分支。\nD = min（24，max（0，攻方 E − 守方 E））\nR = 隨機 0～255\n\nR < 25 → 成功\n否則另取 U = 隨機 0～127，U < D → 成功\n成功扣減士氣 = max（1，⌊攻方 E ÷ 8⌋）\n目標士氣最低保留 1'));
    tactical.append(element('h3','投射物命中'));
    tactical.append(element('pre','兩條投射物生成流程的基本扣減量分別為 28、32（投射物名稱待確認）。\n命中騎兵、弓兵：扣基本量\n命中步兵：扣 ⌊基本量 ÷ 4⌋，即 7 或 8\n命中武將：依武將狀態忽略命中，或扣 ⌊基本量 ÷ 4⌋\n\n部隊士氣扣盡 → 該單位失效\n武將士氣最低保留 1'));
    tactical.append(element('h3','戰後兵力與軍團士氣'));
    tactical.append(element('pre','各編制戰後兵力 = 10 ×（尚未投入的兵力單位 + 場上有效單位數）\n軍團戰後兵力 = 六個編制戰後兵力合計\n損兵 = 戰前兵力 − 戰後兵力\n\n勝方士氣基準 = 原軍團士氣\n敗方：原軍團士氣 > 99 → 士氣基準 = 99\n      原軍團士氣 ≤ 99 → 士氣基準 = 0\n新軍團士氣 = ⌊士氣基準 × 戰後兵力 ÷ 戰前兵力⌋\n兵力為 0 時，新士氣為 0'));
    tactical.append(element('p','場上單位士氣的扣減不會立即等量扣除軍團兵數；戰後依有效單位數回算兵力。局勢判定、特殊動作與完整勝負條件仍待確認。'));
    parent.append(tactical);
    const capture = element('article',undefined,'formula-card');
    capture.append(element('h2','潰敗：撤退、被俘與自刎'));
    capture.append(element('pre','Q = 2 × 武術 + 2 × 統率 + 城塞戰適性 + 野戰適性 + 海戰適性\n撤退門檻 = 40 + ⌊Q ÷ 2⌋\nR = 隨機值（0～127）\n\n一般武將，所屬勢力仍有首都：\n  R ≤ 撤退門檻 → 撤退\n  R > 撤退門檻 → 進入被俘處理\n\n君主，所屬勢力仍有首都 → 撤退\n所屬勢力已無首都 → 進入被俘處理'));
    capture.append(element('p','以上用於軍團潰敗處理。解除軍團時的同勢力處理，以及對中立勢力的處理，直接走撤退分支。政治不參與撤退門檻計算。'));
    capture.append(element('pre','進入被俘處理後：\n  原勢力已滅亡，且武將「自刎」為「是」 → 自刎\n  其他情況 → 成為俘虜\n\n君主成為俘虜後，會失去君主身分。'));
    parent.append(capture);
    const joining = element('article',undefined,'formula-card');
    joining.append(element('h2','武將加入與俘虜歸降'));
    joining.append(element('p','每月更新時，等待計數大於 0 則減 1，當月不進行加入或俘虜處理；計數已為 0 才進行下列判定。'));
    joining.append(element('h3','未指定勢力的武將'));
    joining.append(element('pre','先選出武將數最少的有效勢力。\nN = 隨機整數除以 64 的餘數 + 1（1～64）\n\nN = 1～23：\n  從武將最少的勢力開始，依勢力順序循環，加入第 N 個有效勢力。\nN = 24～47：\n  加入武將最少的勢力。\nN = 48～64：\n  玩家武將數 < ⌊玩家據點數 ÷ 4⌋ + 1 → 加入玩家勢力\n  否則 → 本月不加入'));
    joining.append(element('p','武將數最少的勢力若有多個，取勢力順序較後者。武術、統率、政治與適性不參與這個加入判定。'));
    joining.append(element('h3','俘虜歸降與逃走'));
    joining.append(element('pre','R = 隨機值（0～255）\n\nR = 0～31 → 逃走\nR = 32～63，且扣押勢力等於預定加入勢力 → 歸降\n其他情況 → 維持俘虜'));
    parent.append(joining);
  } else if (tab === 'map') {
    const controls = element('div',undefined,'wd-controls');
    const label = element('label','選擇據點'); label.htmlFor = 'wd-map-city';
    const select = element('select'); select.id = 'wd-map-city';
    chapter.cities.forEach(city=>{ const o=element('option',city.name);o.value=city.id;select.append(o); });
    const full = element('a','開啟完整原尺寸地圖（6144 × 4096）');full.href=wdragonData.map.image;full.target='_blank';full.rel='noopener';
    controls.append(label,select,full);parent.append(controls);
    const detail=element('div',undefined,'wd-map-detail');detail.setAttribute('aria-live','polite');parent.append(detail);
    const scroll=element('div',undefined,'map-scroll');const map=element('div',undefined,'wd-map');
    const img=element('img');img.src=wdragonData.map.preview;img.width=1536;img.height=1024;img.alt='臥龍傳戰略地圖（色彩待確認）';map.append(img);scroll.append(map);parent.append(scroll);
    const markers = [];
    const choose = (id) => {
      wdragonView.map.cityId = id;
      const city=chapter.cities[id];select.value=id;
      history.replaceState(null,'',`#wdragon/map/id/city-${id}`);
      markers.forEach((m,i)=>{m.classList.toggle('selected',i===id);m.setAttribute('aria-pressed',String(i===id));});
      detail.replaceChildren(element('h2',city.name),statsList({'種類':city.type,'勢力':city.faction || '—','生產力':`${city.production} / ${city.production_limit}`,'上昇率':city.growth,'防災':city.disaster_prevention,'城兵':`${city.garrison} / ${city.garrison_limit}`,'內政官':city.administrator || '未任命','座標':`${city.x}, ${city.y}`,'相鄰據點':city.neighbor_names.join('、') || '無'}));
    };
    chapter.cities.forEach(city=>{
      const marker=element('button',undefined,'wd-city-marker');marker.type='button';marker.title=city.name;marker.setAttribute('aria-label',city.name);
      marker.style.left=`${(city.x+0.5)/384*100}%`;marker.style.top=`${(city.y+0.5)/256*100}%`;
      marker.addEventListener('click',()=>choose(city.id));markers.push(marker);map.append(marker);
    });
    select.addEventListener('change',()=>choose(Number(select.value)));
    const requestedCity = /^#wdragon\/map\/id\/city-(\d+)$/.exec(location.hash);
    const id = requestedCity ? Number(requestedCity[1]) : wdragonView.map.cityId;
    choose(id >= 0 && id < chapter.cities.length ? id : 0);
    scroll.scrollLeft = wdragonView.map.scrollLeft;
    scroll.scrollTop = wdragonView.map.scrollTop;
    scroll.addEventListener('scroll',()=>{
      wdragonView.map.scrollLeft=scroll.scrollLeft;
      wdragonView.map.scrollTop=scroll.scrollTop;
    });
  }
}

fetch('assets/games/wdragon/data.json').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(data => {
  wdragonData=data;
  const select=document.getElementById('wd-chapter');
  data.chapters.forEach((chapter,index)=>{const option=element('option',chapter.title);option.value=index;select.append(option);});
  select.disabled=false;
  select.addEventListener('change',()=>{
    const x=window.scrollX, y=window.scrollY;
    wdragonChapter=Number(select.value);renderWdragon();
    window.scrollTo(x,y);
  });
  document.getElementById('wd-status').hidden=true;
  if(location.hash.startsWith('#wdragon'))renderWdragon();
}).catch(error=>{
  document.getElementById('wd-status').hidden=false;
  document.getElementById('wd-status').textContent='無法載入遊戲資料，請重新整理頁面。';
});

function addTextSection(parent, title, records) {
  if (!records.length) return;
  parent.append(element('h4', title));
  const list = element('div', undefined, 'stage-text');
  records.forEach(record => list.append(element('p', record.text.replaceAll('@', ''))));
  parent.append(list);
}

function dataLink(name, tab, id) {
  const link = element('a', name);
  link.href = `#toco/${tab}/id/${id}`;
  return link;
}

function linkedNames(items, tab, prefix) {
  const list = element('p', undefined, 'linked-names');
  items.forEach((item, index) => {
    if (index) list.append(document.createTextNode('、'));
    list.append(dataLink(item.name, tab, `${prefix}-${item.id}`));
  });
  return list;
}

function statsList(values, prefix = '') {
  const list = element('dl', undefined, 'unit-stats');
  for (const [label, value] of Object.entries(values)) {
    const pair = element('div');
    pair.append(element('dt', label === '反應' ? '反應/移動' : label), element('dd', prefix + value));
    list.append(pair);
  }
  return list;
}

function renderUnits(units, parent) {
  const byId = new Map(units.map(unit => [unit.id, unit]));
  for (const group of new Set(units.map(unit => unit.group))) {
    const section = element('section', undefined, 'unit-family');
    section.dataset.unitGroup = group;
    const button = element('button', group);
    button.type = 'button';
    button.dataset.unitGroupButton = group;
    button.addEventListener('click', () => selectUnitGroup(group));
    document.getElementById('unit-tabs').append(button);
    section.append(element('h3', '轉職路線'));
    const members = units.filter(unit => unit.group === group);
    const route = element('div', undefined, 'promotion-routes');
    for (const unit of members.filter(unit => unit.promotions.length)) {
      const line = element('div', undefined, 'promotion-line');
      const from = element('a', unit.name);
      from.href = `#toco/units/id/unit-${unit.id}`;
      line.append(from, element('span', '→', 'route-arrow'));
      unit.promotions.forEach((id, index) => {
        if (index) line.append(element('span', '／', 'route-arrow'));
        const target = element('a', byId.get(id).name);
        target.href = `#toco/units/id/unit-${id}`;
        line.append(target);
      });
      route.append(line);
    }
    section.append(route);
    const cards = element('div', undefined, 'unit-cards');
    for (const unit of members) {
      const card = element('article', undefined, 'unit-card');
      card.id = `unit-${unit.id}`;
      const header = element('div', undefined, 'unit-card-header');
      const image = element('img');
      image.src = unit.image;
      image.alt = unit.name + '遊戲圖像';
      image.width = 176; image.height = 130; image.loading = 'lazy';
      const heading = element('div');
      heading.append(element('h4', unit.name));
      const next = unit.promotions.map(id => byId.get(id).name).join('／');
      heading.append(element('p', next ? '可轉職：' + next : '最終職業', 'data-note'));
      header.append(image, heading);
      card.append(header);
      card.append(element('p', unit.protagonist ? '主角初始職業' : unit.recruit_cost == null ? '招募費用：不可直接招募，需轉職' : `招募費用：${unit.recruit_cost} 兵種點數`, 'data-note'));
      card.append(element('h5', '一般升級'), statsList(unit.level_growth, '+'));
      if (unit.promotion_bonus) {
        card.append(element('h5', '轉入此職業時的加成'));
        if (unit.slot === 0) card.append(element('p', '指揮官轉入時適用', 'data-note'));
        card.append(statsList(unit.promotion_bonus, '+'));
      }
      card.append(element('h5', '兵種預設值'), statsList(unit.template_stats));
      card.append(element('h5', '技能'));
      const skills = element('ul', undefined, 'skill-list');
      if (unit.skills.length) unit.skills.forEach(skill => { const li = element('li'); li.append(dataLink(skill.name, 'skills', `skill-${skill.id}`)); skills.append(li); });
      else skills.append(element('li', '無'));
      card.append(skills);
      cards.append(card);
    }
    section.append(cards);
    parent.append(section);
  }
  selectUnitGroup(activeUnitGroup || units[0].group);
}

function selectUnitGroup(group) {
  activeUnitGroup = group;
  document.querySelectorAll('[data-unit-group]').forEach(panel => { panel.hidden = panel.dataset.unitGroup !== group; });
  document.querySelectorAll('[data-unit-group-button]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.unitGroupButton === group)); });
}

function showStage(stage) {
  const panel = document.getElementById('stage-detail');
  panel.replaceChildren(element('h3', stage.name));
  if (stage.id === 'GAME12A') panel.append(element('p', '蘭朵港地圖變體；用途待確認。', 'data-note'));
  const map = stageMaps[stage.id];
  if (map) {
    const legend = element('p', '敵人圖像：初始位置　黃色：事件單位　藍色區域：我方初始部署範圍', 'map-legend');
    panel.append(legend);
    const wrapper = element('div', undefined, 'map-scroll');
    const field = element('div', undefined, 'stage-map');
    field.style.aspectRatio = `${map.width} / ${map.height}`;
    const image = element('img');
    image.src = map.image; image.alt = stage.name + '完整關卡地圖';
    image.width = map.width * 24; image.height = map.height * 24;
    field.append(image);
    const selected = element('p', '滑入單位查看資料，點擊前往敵人頁。', 'map-selection');
    for (const position of map.positions) {
      const enemy = position.event_unit ? unitLookup.get(position.enemy_id) : enemyLookup.get(position.enemy_id);
      const name = enemy?.name || '未辨識單位';
      const marker = element(enemy ? 'a' : 'button', undefined, 'map-unit' + (position.event_unit ? ' event-marker' : ''));
      if (enemy) marker.href = position.event_unit ? `#toco/units/id/unit-${enemy.id}` : `#toco/enemies/id/enemy-${enemy.id}`;
      else marker.type = 'button';
      marker.style.left = `${position.x / map.width * 100}%`;
      marker.style.top = `${position.y / map.height * 100}%`;
      marker.style.width = `${2 / map.width * 100}%`;
      marker.style.height = `${2 / map.height * 100}%`;
      if (position.x / map.width > 0.7) marker.classList.add('tooltip-left');
      if (position.x / map.width < 0.3) marker.classList.add('tooltip-right');
      marker.setAttribute('aria-label', `${name} · 初始位置 (${position.x}, ${position.y})`);
      if (enemy) {
        const sprite = element('img'); sprite.src = enemy.image; sprite.alt = ''; sprite.width = 176; sprite.height = 130;
        marker.append(sprite);
      } else marker.append(element('span', '◆'));
      const tooltip = element('div', undefined, 'unit-tooltip');
      const sourceCard = document.getElementById(`${position.event_unit ? 'unit' : 'enemy'}-${enemy?.id}`);
      if (sourceCard) {
        const card = sourceCard.cloneNode(true);
        card.removeAttribute('id');
        card.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        card.querySelectorAll('a').forEach(link => link.replaceWith(element('span', link.textContent)));
        tooltip.append(card);
      } else tooltip.append(element('strong', name));
      const placeTooltip = () => {
        const rect = marker.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 24);
        tooltip.style.width = `${width}px`;
        tooltip.style.left = `${Math.max(12, Math.min(rect.right + 10, window.innerWidth - width - 12))}px`;
        tooltip.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - tooltip.offsetHeight - 12))}px`;
      };
      marker.addEventListener('mouseenter', placeTooltip);
      marker.addEventListener('focus', placeTooltip);
      marker.append(tooltip);
      const update = () => { selected.textContent = `${name} · 初始位置 (${position.x}, ${position.y})`; };
      marker.addEventListener('mouseenter',update); marker.addEventListener('focus',update);
      field.append(marker);
    }
    for (const point of map.deployment || []) {
      const cell = element('span', undefined, 'deployment-cell');
      cell.style.left = `${point.x / map.width * 100}%`;
      cell.style.top = `${point.y / map.height * 100}%`;
      cell.style.width = `${(point.width || 1) * 100 / map.width}%`;
      cell.style.height = `${(point.height || 1) * 100 / map.height}%`;
      cell.title = '我方初始部署範圍';
      field.append(cell);
    }
    if (map.deployment?.length) {
      const label = element('span', '我方初始部署範圍', 'deployment-area-label');
      label.style.left = `${(Math.min(...map.deployment.map(p => p.x)) + Math.max(...map.deployment.map(p => p.x)) + 1) / 2 / map.width * 100}%`;
      label.style.top = `${Math.min(...map.deployment.map(p => p.y)) / map.height * 100}%`;
      field.append(label);
    }
    for (const guard of map.guard) {
      const mark = element('span', '◆', 'guard-marker');
      mark.style.left = `${(guard.x + 1) / map.width * 100}%`;
      mark.style.top = `${(guard.y + 1) / map.height * 100}%`;
      mark.title = '守護地'; field.append(mark);
    }
    wrapper.append(field);
    panel.append(wrapper, selected);
    if (!map.deployment?.length) panel.append(element('p', '本地圖未標記初始部署範圍。', 'data-note'));
    const initial = element('details', undefined, 'initial-positions');
    initial.append(element('summary', `初始配置（${map.positions.length} 個單位）`));
    const positions = element('ul');
    for (const position of map.positions) {
      const enemy = position.event_unit ? unitLookup.get(position.enemy_id) : enemyLookup.get(position.enemy_id);
      const name = enemy?.name || '未辨識單位';
      const item = element('li');
      item.append(document.createTextNode(`${position.number}. `));
      item.append(enemy ? dataLink(name, position.event_unit ? 'units' : 'enemies', `${position.event_unit ? 'unit' : 'enemy'}-${enemy.id}`) : document.createTextNode(name));
      item.append(document.createTextNode(` · (${position.x}, ${position.y})`));
      positions.append(item);
    }
    initial.append(positions);
    panel.append(initial);
    panel.append(element('p', '出征隊伍依存檔而異；敵人名稱為暫名。', 'data-note'));
  }
  addTextSection(panel, '戰況與建議', stage.briefing);
  const dialogue = element('details');
  dialogue.append(element('summary', '關卡對話'));
  addTextSection(dialogue, '對話', stage.dialogue);
  panel.append(dialogue);
}

async function loadData() {
  const status = document.getElementById('data-status');
  try {
    const [units, stages, enemies, skills, maps] = await Promise.all(['unit-details', 'stages', 'enemies', 'skills', '../maps/index'].map(async name => {
      const response = await fetch(`assets/games/toco/data/${name}.json`);
      if (!response.ok) throw new Error('Unable to load game data');
      return response.json();
    }));
    stageMaps = maps;
    enemyLookup = new Map(enemies.map(enemy => [enemy.id, enemy]));
    unitLookup = new Map(units.map(unit => [unit.id, unit]));
    const groups = document.getElementById('unit-groups');
    renderUnits(units, groups);
    for (const skill of skills) {
      const card = element('article', undefined, 'skill-card');
      card.id = `skill-${skill.id}`;
      card.append(element('span', String(skill.id).padStart(2, '0'), 'skill-number'), element('h3', skill.name));
      card.append(statsList({[skill.effect_label]:skill.base_power,'耗魔':skill.mana_cost,'施放距離':`${skill.cast_range} 格`,'影響範圍':skill.area_value === 1 ? '單體' : `目標周圍 ${skill.area_value - 1} 格`}));
      const users = units.filter(unit => unit.skills.some(item => item.id === skill.id));
      const enemyUsers = enemies.filter(enemy => enemy.skills.some(item => item.id === skill.id));
      if (users.length) card.append(element('h4', '兵種'), linkedNames(users, 'units', 'unit'));
      if (enemyUsers.length) card.append(element('h4', '敵人（暫名）'), linkedNames(enemyUsers, 'enemies', 'enemy'));
      if (!users.length && !enemyUsers.length) card.append(element('p', '目前收錄的兵種與敵人未配置此技能。', 'data-note'));
      document.getElementById('skill-cards').append(card);
    }
    for (const enemy of enemies) {
      const card = element('article', undefined, 'unit-card');
      card.id = `enemy-${enemy.id}`;
      const image = element('img', undefined, 'enemy-portrait');
      image.src = enemy.image; image.alt = enemy.name; image.width = 176; image.height = 130; image.loading = 'lazy';
      card.append(image, element('h4', enemy.name), statsList(enemy.template_stats));
      card.append(element('h5', '技能'));
      const skills = element('ul', undefined, 'skill-list');
      enemy.skills.forEach(skill => { const li = element('li'); li.append(dataLink(skill.name, 'skills', `skill-${skill.id}`)); skills.append(li); });
      if (!enemy.skills.length) skills.append(element('li', '無'));
      card.append(skills);
      document.getElementById('enemy-cards').append(card);
    }
    const select = document.getElementById('stage-select');
    const normalStages = element('optgroup'); normalStages.label = '正式關卡';
    const extraMaps = element('optgroup'); extraMaps.label = '額外地圖（用途未確認）';
    select.append(normalStages, extraMaps);
    stages.forEach(stage => {
      const option = element('option', `${stage.id.replace('GAME', '')} · ${stage.name}`);
      option.value = stage.id;
      if (stage.id === 'GAME12A') { option.textContent = '12A · 蘭朵港地圖變體（無單位配置）'; extraMaps.append(option); }
      else normalStages.append(option);
    });
    select.disabled = false;
    select.addEventListener('change', () => showStage(stages.find(stage => stage.id === select.value)));
    showStage(stages[0]);
    status.hidden = true;
    renderPage();
  } catch {
    status.textContent = '無法載入遊戲資料，請重新整理頁面。';
  }
}
loadData();

async function loadTerrainTables() {
  const parent = document.getElementById('terrain-tables');
  try {
    const response = await fetch('assets/games/toco/data/terrain.json');
    if (!response.ok) throw new Error('terrain');
    for (const terrain of await response.json()) {
      parent.append(element('h4', terrain.name + '地形耗點'));
      const wrapper = element('div', undefined, 'table-scroll');
      const table = element('table');
      const head = element('tr');
      ['圖塊', '地形', '地面', '飛行', '不可通行兵種'].forEach(name => head.append(element('th', name)));
      const thead = element('thead'); thead.append(head); table.append(thead);
      const body = element('tbody');
      for (const row of terrain.rows) {
        const line = element('tr');
        const preview = element('td');
        if (row.image) {
          const image = element('img', undefined, 'terrain-preview');
          image.src = row.image; image.alt = `${terrain.name} ${row.name}`;
          image.width = 48; image.height = 48; image.loading = 'lazy';
          preview.append(image);
        } else preview.textContent = '無範例';
        line.append(preview);
        [row.name, row.ground === 99 ? '不可通行' : row.ground, row.flying === 99 ? '不可通行' : row.flying, row.blocked.join('、') || '無'].forEach(value => line.append(element('td', value)));
        body.append(line);
      }
      table.append(body); wrapper.append(table); parent.append(wrapper);
    }
  } catch { parent.append(element('p', '地形表載入失敗。')); }
}
loadTerrainTables();
