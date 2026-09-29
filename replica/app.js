// 控制面板 / 筛选 / 颜色组 / 播放动画 / 笔记卡片
(function () {
  const STORE_KEY = 'obsidian-replica-graph';
  // 文本透明度：Obsidian 滑块范围是 −3～3（默认 0，拉远会隐藏标签）。
  // 这里把下限扩展到 −7 并设为默认：最小缩放 1/128 时 log2 = −7，标签在任何缩放下都显示；调到 0 即为 Obsidian 默认行为
  const TEXT_FADE_MIN = -7;
  const SETTINGS_VERSION = 2;
  // 其余默认值与 Obsidian 相同（向心力滑块 0.518 ≈ 实际强度 0.1）
  const DEFAULTS = {
    settingsVersion: SETTINGS_VERSION,
    search: '', showTags: false, showAttachments: false, hideUnresolved: false, showOrphans: true,
    colorGroups: [],
    showArrow: false, textFadeMultiplier: TEXT_FADE_MIN, nodeSizeMultiplier: 1, lineSizeMultiplier: 1,
    centerStrength: 0.518, repelStrength: 10, linkStrength: 1, linkDistance: 250,
    collapsed: { filter: false, groups: true, display: false, forces: false },
    open: true,
    zoom: {},                  // 各库规模下保存的缩放值（对应 Obsidian graph.json 中的 scale）
  };
  let opts, stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
  catch (e) { console.warn('[设置] 读取本地设置失败，使用默认值', e); }
  opts = { ...structuredClone(DEFAULTS), ...(stored || {}) };
  // 版本号要看存储里的原始数据：合并后会继承 DEFAULTS 的版本号
  if (stored && stored.settingsVersion !== SETTINGS_VERSION) {
    // v1 → v2：文本透明度默认值由 0 改为始终显示标签
    console.info(`[设置] 迁移 v${stored.settingsVersion || 1} → v${SETTINGS_VERSION}：文本透明度 ${opts.textFadeMultiplier} → ${TEXT_FADE_MIN}`);
    opts.textFadeMultiplier = TEXT_FADE_MIN;
  }
  opts.settingsVersion = SETTINGS_VERSION;
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(opts));
  save();

  // 滑块 -> 物理参数（对数曲线，与 Obsidian 一致）
  const logCurve = (v, t = 0.01) => (Math.pow(t, 1 - v) - t) / (1 - t);
  const forcesOf = (o) => ({
    centerStrength: logCurve(o.centerStrength),
    repelStrength: o.repelStrength ** 3,
    linkStrength: logCurve(o.linkStrength),
    linkDistance: o.linkDistance,
  });

  // ---------------- 数据 ----------------
  const files = window.VAULT.files;
  const fileByName = new Map(files.map(f => [f.name, f]));
  let focusedFile = null;

  function makeMatcher(query) {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    return (f) => tokens.every(tok => {
      const neg = tok.startsWith('-');
      const t = neg ? tok.slice(1) : tok;
      let ok;
      if (t.startsWith('tag:')) { const q = t.slice(4).replace(/^#?/, '#'); ok = (f.tags || []).some(x => x.toLowerCase().startsWith(q)); }
      else if (t.startsWith('path:')) ok = (f.path || '').toLowerCase().includes(t.slice(5));
      else if (t.startsWith('file:')) ok = f.name.toLowerCase().includes(t.slice(5));
      else ok = f.name.toLowerCase().includes(t) || (f.path || '').toLowerCase().includes(t);
      return neg ? !ok : ok;
    });
  }

  // 与 Obsidian GraphDataEngine.render 内部的 graphData() 同构：
  //   filter(id, type) 返回 false（隐藏）/ true（显示）/ 颜色（显示并上色，只对笔记生效）
  //   progression > 0 时为“播放动画”：文件按创建时间排序，节点和连线逐个计数，计数到 progression 截断
  // 返回 { nodes, links, count }，count 为节点 + 连线的计数（播放动画用）
  function buildGraph(progression = 0) {
    const search = makeMatcher(opts.search);
    const groups = opts.colorGroups.filter(g => g.query.trim()).map(g => ({ m: makeMatcher(g.query), color: hexToColor(g.color) }));
    const filter = (id, type) => {
      if (type === '') {                                       // 笔记：搜索决定可见性，颜色组决定颜色
        const f = fileByName.get(id);
        if (search && !search(f)) return false;
        const g = groups.find(g => g.m(f));
        return g ? g.color : true;
      }
      if (!search) return true;
      if (type === 'tag') return search({ name: id, path: '', tags: [id] });
      if (type === 'attachment') return search(fileByName.get(id));
      return true;                                             // 未解析节点不受搜索影响
    };

    const nodes = {}, links = [];
    let count = 0, cutoff = null;
    const order = progression ? [...files].sort((a, b) => a.ctime - b.ctime) : files;
    // 计数一个条目（节点或连线）；返回该条目是否仍在进度之内
    const take = (fileName) => {
      const within = !progression || count < progression;
      if (progression && count === progression) cutoff = fileName;
      count++;
      return within;
    };

    for (const f of order) {
      const isAttachment = f.kind === 'attachment';
      if (isAttachment && !opts.showAttachments) continue;
      const type = isAttachment ? 'attachment' : '';
      const res = filter(f.name, type);
      if (!res) continue;
      const node = nodes[f.name] = { type, label: f.name };
      if (res !== true) node.color = res;
      if (opts.showOrphans) take(f.name);                      // 与源码一致：只有显示孤立文件时节点本身才计数
      for (const target of f.links) {
        const tf = fileByName.get(target);
        if (tf) {                                              // 已解析链接
          if (tf.kind === 'attachment' && !opts.showAttachments) continue;
          if (filter(target, tf.kind === 'attachment' ? 'attachment' : '') && take(f.name)) links.push([f.name, target]);
        } else if (!opts.hideUnresolved && filter(target, 'unresolved')) {   // 未解析链接
          if (take(f.name)) { links.push([f.name, target]); nodes[target] = nodes[target] || { type: 'unresolved', label: target }; }
        }
      }
      if (opts.showTags) {
        for (const tag of f.tags) {
          if (!filter(tag, 'tag')) continue;
          if (take(f.name)) { links.push([f.name, tag]); nodes[tag] = nodes[tag] || { type: 'tag', label: tag }; }
        }
      }
    }
    // 播放动画：删除排在截断文件之后的所有文件
    if (progression && cutoff) {
      const idx = order.findIndex(f => f.name === cutoff);
      for (const f of order.slice(idx + 1)) delete nodes[f.name];
    }
    // 连线只保留两端都存在的（与渲染器 setData 行为一致）
    const kept = links.filter(([s, t]) => nodes[s] && nodes[t]);
    if (!opts.showOrphans) {
      const linked = new Set();
      for (const [s, t] of kept) { linked.add(s); linked.add(t); }
      for (const id of Object.keys(nodes)) if (!linked.has(id)) delete nodes[id];
    }
    if (focusedFile && nodes[focusedFile]) nodes[focusedFile].type = 'focused';
    return { nodes, links: kept, count };
  }

  // ---------------- 渲染器 ----------------
  const graphEl = document.getElementById('graph');
  const renderer = new GraphRenderer(graphEl, window.SIM_WORKER_MAIN);
  window.__renderer = renderer;   // 便于在控制台调试
  const refresh = () => renderer.setData(buildGraph());
  const applyDisplay = () => renderer.setOptions({
    nodeSize: opts.nodeSizeMultiplier, lineSize: opts.lineSizeMultiplier, textFade: opts.textFadeMultiplier, showArrow: opts.showArrow });

  applyDisplay();
  renderer.setForces(forcesOf(opts));
  refresh();
  // 初始缩放：优先恢复上次保存的缩放（与 Obsidian 一致）；没有时按“稳定后半径约 100·√N”（实测）让整张图落在视口内
  const vaultKey = new URLSearchParams(location.search).get('scale') || '1';
  const n0 = Math.max(1, renderer.nodes.length);
  const savedZoom = opts.zoom && opts.zoom[vaultKey];
  renderer.zoomTo(savedZoom || Math.min(1, Math.min(graphEl.clientWidth, graphEl.clientHeight) / (2 * 100 * Math.sqrt(n0))));
  // 与源码一致：每 2 秒检查一次目标缩放，变化了才保存（而不是每次滚轮都写存储）
  let lastSavedZoom = renderer.targetScale;
  setInterval(() => {
    if (renderer.targetScale === lastSavedZoom) return;
    lastSavedZoom = renderer.targetScale;
    opts.zoom = { ...opts.zoom, [vaultKey]: lastSavedZoom };
    save();
  }, 2000);

  // ---------------- 播放动画（按创建时间逐个生长）----------------
  let timelapse = null;
  // 与 Obsidian renderProgression 一致：progression 从 1 开始，
  // 速度 = clamp(0.5·√总条目数, 5, 100) 条/秒，条目 = 节点 + 连线（笔记先出现，链接再一条条连出去）
  function playTimelapse() {
    let progression = 1;
    const first = buildGraph(progression);
    const total = first.count;
    const speed = Math.max(5, Math.min(100, 0.5 * Math.sqrt(total)));
    const start = performance.now();
    const token = timelapse = {};
    console.info(`[播放动画] 共 ${total} 个条目（节点 + 连线），速度 ${speed.toFixed(1)} 条/秒，约 ${(total / speed).toFixed(0)} 秒`);
    renderer.setData(first);
    (function step() {
      if (timelapse !== token) return;                      // 被筛选条件变化等打断
      const k = 1 + Math.floor(speed * (performance.now() - start) / 1000);
      if (k !== progression) {
        progression = k;
        if (k > total) { timelapse = null; refresh(); console.info('[播放动画] 结束'); return; }
        renderer.setData(buildGraph(k));
      }
      requestAnimationFrame(step);
    })();
  }

  // ---------------- 控制面板 ----------------
  const el = document.getElementById('controls');
  const ICON = {
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
    reset: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  };
  const section = (key, name, body, extra = '') => `
    <div class="gc-section ${opts.collapsed[key] ? 'is-collapsed' : ''}" data-sec="${key}">
      <div class="gc-head">${ICON.chev}<span class="name">${name}</span>${extra}</div>
      <div class="gc-body">${body}</div>
    </div>`;
  const toggle = (key, label) => `<div class="gc-item"><span class="label">${label}</span><div class="toggle ${opts[key] ? 'on' : ''}" data-key="${key}"></div></div>`;
  const slider = (key, label, min, max, step) => `
    <div class="gc-item col"><div class="row" style="justify-content:space-between"><span class="label">${label}</span><span class="val" data-val="${key}"></span></div>
    <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${opts[key]}"></div>`;

  function renderControls() {
    el.classList.toggle('is-close', !opts.open);
    el.innerHTML =
      section('filter', '筛选', `
        <input class="search-input" id="search" placeholder="搜索文件…" value="${opts.search.replace(/"/g, '&quot;')}">
        ${toggle('showTags', '标签')}${toggle('showAttachments', '附件')}
        ${toggle('hideUnresolved', '仅显示存在的文件')}${toggle('showOrphans', '孤立文件')}
        <div class="hint">支持 <b>tag:#AI</b>、<b>path:Java</b>、<b>file:索引</b>，以 - 开头表示排除</div>`,
        `<button class="icon-btn" id="gc-reset" title="恢复默认设置">${ICON.reset}</button>
         <button class="icon-btn" id="gc-close" title="关闭">${ICON.close}</button>`) +
      section('groups', '颜色组', `
        <div id="cg-list">${opts.colorGroups.map((g, i) => `
          <div class="cg-row" data-i="${i}">
            <input type="text" value="${g.query.replace(/"/g, '&quot;')}" placeholder="输入搜索条件…">
            <input type="color" value="${g.color}">
            <button class="icon-btn" data-del="${i}" title="删除">${ICON.trash}</button>
          </div>`).join('')}</div>
        <div class="gc-actions"><button class="btn cta" id="cg-add">新建组</button></div>`) +
      section('display', '外观', `
        ${toggle('showArrow', '箭头')}
        ${slider('textFadeMultiplier', '文本透明度', TEXT_FADE_MIN, 3, 0.1)}
        ${slider('nodeSizeMultiplier', '节点大小', 0.1, 5, 0.01)}
        ${slider('lineSizeMultiplier', '连线粗细', 0.1, 5, 0.01)}
        <div class="gc-actions"><button class="btn" id="timelapse">播放动画</button></div>`) +
      section('forces', '力度', `
        ${slider('centerStrength', '图谱向心力', 0, 1, 0.001)}
        ${slider('repelStrength', '节点间的排斥力', 0, 20, 0.01)}
        ${slider('linkStrength', '相连节点间的吸引力', 0, 1, 0.001)}
        ${slider('linkDistance', '连线长度', 30, 500, 1)}`);
    el.querySelectorAll('input[type=range]').forEach(syncSlider);
  }
  function syncSlider(input) {
    const k = input.dataset.key, v = parseFloat(input.value);
    input.style.setProperty('--p', ((v - input.min) / (input.max - input.min) * 100) + '%');
    const lbl = el.querySelector(`[data-val="${k}"]`);
    if (lbl) lbl.textContent = k === 'linkDistance' ? v.toFixed(0) : v.toFixed(2);
  }

  const DISPLAY_KEYS = ['showArrow', 'textFadeMultiplier', 'nodeSizeMultiplier', 'lineSizeMultiplier'];
  const FORCE_KEYS = ['centerStrength', 'repelStrength', 'linkStrength', 'linkDistance'];
  function onOptionChange(key) {
    save();
    if (timelapse && !DISPLAY_KEYS.includes(key) && !FORCE_KEYS.includes(key)) {
      timelapse = null;                       // 改筛选/颜色组时终止播放动画，避免覆盖结果
      console.info('[播放动画] 因筛选条件变化而终止');
    }
    if (DISPLAY_KEYS.includes(key)) applyDisplay();
    else if (FORCE_KEYS.includes(key)) renderer.setForces(forcesOf(opts));
    else refresh();
  }

  el.addEventListener('click', (e) => {
    const head = e.target.closest('.gc-head');
    if (e.target.closest('#gc-reset')) {
      const keepOpen = opts.open;
      opts = structuredClone(DEFAULTS); opts.open = keepOpen; save();
      renderControls(); applyDisplay(); renderer.setForces(forcesOf(opts)); refresh();
      return;
    }
    if (e.target.closest('#gc-close')) { opts.open = false; save(); el.classList.add('is-close'); return; }
    if (head) {
      const sec = head.parentElement, key = sec.dataset.sec;
      opts.collapsed[key] = !opts.collapsed[key]; save();
      sec.classList.toggle('is-collapsed', opts.collapsed[key]);
      return;
    }
    const tg = e.target.closest('.toggle');
    if (tg) { const k = tg.dataset.key; opts[k] = !opts[k]; tg.classList.toggle('on', opts[k]); onOptionChange(k); return; }
    if (e.target.closest('#cg-add')) {
      const palette = ['#e93147', '#ec7500', '#e0ac00', '#08b94e', '#00bfbc', '#086ddd', '#7852ee', '#d53984'];
      opts.colorGroups.push({ query: '', color: palette[opts.colorGroups.length % palette.length] });
      save(); renderControls();
      el.querySelector('#cg-list .cg-row:last-child input[type=text]').focus();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) { opts.colorGroups.splice(+del.dataset.del, 1); save(); renderControls(); refresh(); return; }
    if (e.target.closest('#timelapse')) playTimelapse();
  });
  let searchTimer = null;
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'search') {
      opts.search = t.value;
      clearTimeout(searchTimer); searchTimer = setTimeout(() => onOptionChange('search'), 200);
    } else if (t.type === 'range') {
      opts[t.dataset.key] = parseFloat(t.value); syncSlider(t); onOptionChange(t.dataset.key);
    } else if (t.closest('.cg-row')) {
      const i = +t.closest('.cg-row').dataset.i;
      if (t.type === 'text') opts.colorGroups[i].query = t.value; else opts.colorGroups[i].color = t.value;
      clearTimeout(searchTimer); searchTimer = setTimeout(() => onOptionChange('colorGroups'), 150);
    }
  });
  document.getElementById('gear').onclick = document.getElementById('btn-settings').onclick = () => {
    opts.open = !opts.open; save(); el.classList.toggle('is-close', !opts.open);
  };
  renderControls();

  // ---------------- 顶栏 ----------------
  const themeBtn = document.getElementById('btn-theme');
  const setTheme = (dark) => { document.body.classList.toggle('theme-dark', dark); localStorage.setItem(STORE_KEY + '-theme', dark ? 'dark' : 'light'); renderer.readColors(); };
  setTheme(localStorage.getItem(STORE_KEY + '-theme') === 'dark');
  themeBtn.onclick = () => setTheme(!document.body.classList.contains('theme-dark'));
  document.getElementById('btn-restart').onclick = () => renderer.reheat();
  const scaleSel = document.getElementById('scale');
  scaleSel.value = new URLSearchParams(location.search).get('scale') || '1';
  scaleSel.onchange = () => { const u = new URL(location.href); u.searchParams.set('scale', scaleSel.value); location.href = u; };

  const fpsEl = document.getElementById('fps');
  let frames = 0, last = performance.now();
  (function loop(now) {
    frames++;
    if (now - last >= 500) {
      fpsEl.textContent = `${Math.round(frames * 1000 / (now - last))} FPS · ${renderer.nodes.length} 节点`;
      frames = 0; last = now;
    }
    requestAnimationFrame(loop);
  })(last);

  // ---------------- 点击节点：打开笔记卡片 ----------------
  const card = document.getElementById('note-card');
  const backlinks = new Map();
  for (const f of files) for (const t of f.links) { if (!backlinks.has(t)) backlinks.set(t, []); backlinks.get(t).push(f.name); }
  function openNote(id) {
    const f = fileByName.get(id);
    focusedFile = f && f.kind === 'md' ? id : null;
    refresh();
    const out = f ? f.links : [], back = backlinks.get(id) || [];
    const kind = !f ? (id.startsWith('#') ? '标签' : '未创建的笔记') : f.kind === 'attachment' ? '附件' : '笔记';
    const list = (arr) => arr.length ? arr.map(n => `<a data-open="${n.replace(/"/g, '&quot;')}">${n}</a>`).join('') : '<div class="hint">无</div>';
    card.innerHTML = `<button class="icon-btn close" id="card-close">${ICON.close}</button>
      <h3>${id}</h3><div class="path">${f ? f.path : kind}</div>
      ${f && f.tags.length ? f.tags.map(t => `<span class="tag">${t}</span>`).join('') : ''}
      ${f && f.kind === 'md' ? `<h4>出链（${out.length}）</h4>${list(out)}` : ''}
      <h4>反向链接（${back.length}）</h4>${list(back)}`;
    card.classList.add('show');
    console.info('[笔记] 打开', id);
  }
  renderer.onNodeClick = (node) => openNote(node.id);
  card.addEventListener('click', (e) => {
    if (e.target.closest('#card-close')) { card.classList.remove('show'); focusedFile = null; refresh(); return; }
    const a = e.target.closest('[data-open]');
    if (a) openNote(a.dataset.open);
  });
})();
