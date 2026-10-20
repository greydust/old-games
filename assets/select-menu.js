/* Shared select presentation. Original selects retain values and change handlers. */
(() => {
  const controls = new WeakMap();
  let sequence = 0, active = null;
  function enhance(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    const wrap = document.createElement('span'); wrap.className = 'site-select';
    const button = document.createElement('button'); button.type = 'button';
    const list = document.createElement('div'); list.className = 'site-select-options';
    list.id = `site-options-${++sequence}`; list.hidden = true;
    button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-controls', list.id); button.setAttribute('aria-expanded', 'false');
    list.setAttribute('role', 'listbox');
    let closing=false;
    const close = () => {
      if(closing)return;closing=true;
      try { list.hidden=true;button.setAttribute('aria-expanded','false');if(active?.wrap===wrap)active=null;list.remove(); }
      finally { closing=false; }
    };
    const sync = () => {
      const label = select.getAttribute('aria-label') || [...select.labels].map(l => l.textContent.trim()).join(' ') || '選擇';
      button.setAttribute('aria-label', label); list.setAttribute('aria-label', label);
      const text = select.selectedOptions[0]?.textContent || '—';
      if (button.textContent !== text) button.textContent = text;
      button.disabled = select.disabled || !select.options.length;
      if (button.disabled) close();
    };
    const show = () => {
      active?.close();
      select.dispatchEvent(new Event('focus')); // Expand lazy editor options first.
      sync(); if (button.disabled) return;
      list.replaceChildren();
      const options = [...select.options].map((option, index) => {
        const item = document.createElement('button'); item.type = 'button';
        item.textContent = option.textContent; item.tabIndex = -1;
        item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected));
        item.disabled = option.disabled || option.parentElement.disabled === true;
        item.addEventListener('click', () => {
          select.selectedIndex = index; close(); sync(); button.focus();
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true })); sync();
        });
        return item;
      });
      list.append(...options); document.body.append(list); list.hidden = false; button.setAttribute('aria-expanded', 'true');
      const rect=button.getBoundingClientRect(),below=innerHeight-rect.bottom-8,above=rect.top-8;
      Object.assign(list.style,{position:'fixed',width:rect.width+'px',left:Math.max(0,Math.min(rect.left,innerWidth-rect.width))+'px',right:'auto',top:below>=160||below>=above?rect.bottom+'px':'auto',bottom:below>=160||below>=above?'auto':innerHeight-rect.top+'px',maxHeight:Math.min(300,Math.max(below,above))+'px'});
      active={wrap,list,close};
      const enabled = options.filter(o => !o.disabled);
      const focus = item => { item?.focus(); item?.scrollIntoView({ block: 'nearest' }); };
      focus(options[select.selectedIndex]?.disabled ? enabled[0] : options[select.selectedIndex] || enabled[0]);
      let typed = '', lastKey = 0;
      list.onkeydown = event => {
        const index = enabled.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); close(); button.focus(); return; }
        if (event.key === 'Tab') { close(); button.focus(); return; }
        let next;
        if (event.key === 'ArrowDown') next = enabled[Math.min(index + 1, enabled.length - 1)];
        else if (event.key === 'ArrowUp') next = enabled[Math.max(index - 1, 0)];
        else if (event.key === 'Home') next = enabled[0];
        else if (event.key === 'End') next = enabled.at(-1);
        else if (event.key.length === 1 && event.key !== ' ') {
          typed = Date.now() - lastKey > 700 ? event.key : typed + event.key; lastKey = Date.now();
          next = enabled.find(o => o.textContent.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()));
        } else return;
        event.preventDefault(); focus(next);
      };
    };
    controls.set(select, { sync, close });
    select.classList.add('site-select-native');
    select.before(wrap); wrap.append(select, button);
    button.addEventListener('click', () => list.hidden ? show() : close());
    button.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); show(); }
    });
    wrap.addEventListener('focusout', event => { if (!wrap.contains(event.relatedTarget) && !list.contains(event.relatedTarget)) close(); });
    list.addEventListener('focusout', event => { if(!wrap.contains(event.relatedTarget)&&!list.contains(event.relatedTarget))close(); });
    select.addEventListener('change', sync); sync();
  }
  const scan = root => {
    if (root instanceof HTMLSelectElement) enhance(root);
    root.querySelectorAll?.('select').forEach(enhance);
  };
  scan(document);
  new MutationObserver(records => {
    const dirty = new Set();
    records.forEach(record => {
      const select = record.target instanceof Element ? record.target.closest('select') : record.target.parentElement?.closest('select');
      if (select) dirty.add(select);
      record.addedNodes.forEach(node => { if (node instanceof Element) scan(node); });
    });
    dirty.forEach(select => controls.get(select)?.sync());
    if(active&&!active.wrap.isConnected)active.close();
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'selected', 'aria-label', 'label'] });
  // Map markers and other existing controls can update select.value directly.
  const syncValues = () => queueMicrotask(() => document.querySelectorAll('select').forEach(select => controls.get(select)?.sync()));
  ['click', 'keyup', 'pointerup', 'change'].forEach(type => document.addEventListener(type, syncValues));
  document.addEventListener('pointerdown', event => {
    if(active&&!active.wrap.contains(event.target)&&!active.list.contains(event.target))active.close();
  });
  document.addEventListener('scroll',event=>{if(active&&!active.list.contains(event.target))active.close();},true);
  window.addEventListener('resize',()=>active?.close());
})();
