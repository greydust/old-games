let stageMaps = {};
let enemyLookup = new Map();
let activeUnitGroup = null;
function renderPage() {
  const [hash, target] = location.hash.split('/id/');
  const isGame = hash.startsWith('#toco') || ['#units-section', '#stages-section'].includes(hash);
  const tab = hash === '#toco/enemies' ? 'enemies' : hash === '#toco/formulas' ? 'formulas' : hash === '#toco/skills' ? 'skills' : hash === '#toco/units' || hash === '#units-section' ? 'units' : hash === '#toco/stages' || hash === '#stages-section' ? 'stages' : 'overview';
  document.getElementById('home').hidden = isGame;
  document.getElementById('toco').hidden = !isGame;
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === (isGame ? 'toco' : 'home')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-tab]').forEach(link => {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
  document.title = isGame ? '精靈幻界 · ' + ({overview:'首頁', units:'兵種', stages:'關卡', enemies:'敵人', skills:'技能', formulas:'公式'}[tab]) : '老遊戲收藏館';
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
    pair.append(element('dt', label), element('dd', prefix + value));
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
      from.href = `#unit-${unit.id}`;
      from.addEventListener('click', event => { event.preventDefault(); document.getElementById(`unit-${unit.id}`).scrollIntoView({behavior:'smooth', block:'start'}); });
      line.append(from, element('span', '→', 'route-arrow'));
      unit.promotions.forEach((id, index) => {
        if (index) line.append(element('span', '／', 'route-arrow'));
        const target = element('a', byId.get(id).name);
        target.href = `#unit-${id}`;
        target.addEventListener('click', event => { event.preventDefault(); document.getElementById(`unit-${id}`).scrollIntoView({behavior:'smooth', block:'start'}); });
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
      card.append(header, element('h5', '一般升級'), statsList(unit.level_growth, '+'));
      if (members[0].id !== unit.id) {
        card.append(element('h5', '轉入此職業時的加成'), statsList(unit.promotion_bonus, '+'));
      }
      card.append(element('h5', '兵種預設值'), statsList({...unit.template_stats, '移動力': `${unit.template_stats['反應']} 點`}));
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
  if (stage.id === 'GAME12A') panel.append(element('p', '這是蘭朵港的額外地圖變體，與第 12 關有 1,931 個圖塊不同；沒有固定單位配置，也未列在正常關卡銜接表。是否用於過場、測試或未使用內容，尚未確認。', 'data-note')); 
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
      const enemy = enemyLookup.get(position.enemy_id);
      const name = position.event_unit ? '事件單位' : enemy?.name || '未辨識單位';
      const marker = element(enemy && !position.event_unit ? 'a' : 'button', undefined, 'map-unit' + (position.event_unit ? ' event-marker' : ''));
      if (enemy && !position.event_unit) marker.href = `#toco/enemies/id/enemy-${enemy.id}`;
      else marker.type = 'button';
      marker.style.left = `${(position.x + 1) / map.width * 100}%`;
      marker.style.top = `${(position.y + 1) / map.height * 100}%`;
      if (position.x / map.width > 0.7) marker.classList.add('tooltip-left');
      if (position.x / map.width < 0.3) marker.classList.add('tooltip-right');
      marker.setAttribute('aria-label', `${name} · 初始位置 (${position.x}, ${position.y})`);
      if (enemy) {
        const sprite = element('img'); sprite.src = enemy.image; sprite.alt = ''; sprite.width = 176; sprite.height = 130;
        marker.append(sprite);
      } else marker.append(element('span', '◆'));
      const tooltip = element('span', undefined, 'unit-tooltip');
      tooltip.append(element('strong', name + (position.event_unit ? '' : '（暫名）')),
        element('span', `初始位置 (${position.x}, ${position.y})`));
      if (enemy && !position.event_unit) {
        tooltip.append(element('span', Object.entries(enemy.template_stats).filter(([label]) => label !== '反應').map(([label,value]) => `${label} ${value}`).join(' · ')),
          element('span', `移動力 ${enemy.template_stats['反應']} · 技能：${enemy.skills.map(skill=>skill.name).join('、') || '無'}`));
      }
      marker.append(tooltip);
      const update = () => { selected.textContent = `${name} · 初始位置 (${position.x}, ${position.y})`; };
      marker.addEventListener('mouseenter',update); marker.addEventListener('focus',update);
      field.append(marker);
    }
    for (const point of map.deployment || []) {
      const cell = element('span', undefined, 'deployment-cell');
      cell.style.left = `${point.x / map.width * 100}%`;
      cell.style.top = `${point.y / map.height * 100}%`;
      cell.style.width = `${100 / map.width}%`;
      cell.style.height = `${100 / map.height}%`;
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
      const enemy = enemyLookup.get(position.enemy_id);
      const name = position.event_unit ? '事件單位' : enemy?.name || '未辨識單位';
      const item = element('li');
      item.append(document.createTextNode(`${position.number}. `));
      item.append(enemy && !position.event_unit ? dataLink(name, 'enemies', `enemy-${enemy.id}`) : document.createTextNode(name));
      item.append(document.createTextNode(` · (${position.x}, ${position.y})`));
      positions.append(item);
    }
    initial.append(positions);
    panel.append(initial);
    panel.append(element('p', '顯示關卡檔的固定初始配置；玩家自行編成的出征隊伍依存檔而異。敵人名稱為圖像暫名。', 'data-note'));
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
      card.append(image, element('h4', enemy.name), statsList({...enemy.template_stats, '移動力': `${enemy.template_stats['反應']} 點`}));
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
    status.textContent = '無法載入遊戲資料，請重新整理，或透過本機測試伺服器開啟網頁。';
  }
}
loadData();
