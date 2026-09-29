// 统一的 Obsidian 风格“力度”面板 + FPS 计 + 规模切换
// 用法：KG_panel({ title, tech, onChange(params, key), onReheat, onFit, note })
(function () {
  // 与 Obsidian 同名同范围的 4 个参数
  const SLIDERS = [
    { key: 'center',   label: '图谱向心力',       min: 0, max: 1,   step: 0.01, value: 0.52 },
    { key: 'repel',    label: '节点间的排斥力',   min: 0, max: 20,  step: 0.1,  value: 10 },
    { key: 'link',     label: '相连节点间的吸引力', min: 0, max: 1,   step: 0.01, value: 1 },
    { key: 'distance', label: '连线长度',         min: 30, max: 500, step: 1,   value: 250 },
  ];

  // Obsidian 参数 -> d3-force 参数 的统一映射（基于 d3 的方案共用）
  window.KG_toD3 = (p) => ({
    centerStrength: p.center * 0.1,
    charge: -p.repel * 30,
    linkStrength: p.link,
    linkDistance: p.distance * 0.4,
  });

  window.KG_panel = function (opts) {
    const params = Object.fromEntries(SLIDERS.map(s => [s.key, s.value]));
    const n = new URLSearchParams(location.search).get('n') || '0';
    const d = window.KG_DATA;

    // 顶栏
    const top = document.createElement('div');
    top.className = 'kg-topbar';
    top.innerHTML = `<a href="../index.html">← 目录</a><span class="title">${opts.title}</span>
      <span class="tech">${opts.tech || ''}</span><span class="kg-fps">-- FPS</span>
      <span class="tech">${d.nodes.length} 节点 / ${d.links.length} 连线</span>`;
    document.body.appendChild(top);

    // 面板
    const panel = document.createElement('div');
    panel.className = 'kg-panel';
    const legend = Object.entries(window.KG_GROUPS)
      .filter(([g]) => g !== 'misc' || n !== '0')
      .map(([, g]) => `<span><i style="background:${g.color}"></i>${g.name}</span>`).join('');
    panel.innerHTML = `
      <details open><summary>力度</summary><div class="body">
        ${SLIDERS.map(s => `<div class="kg-row"><div class="lbl">${s.label}</div>
          <div class="ctl"><span class="val" id="v-${s.key}">${s.value}</span>
          <input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"></div></div>`).join('')}
        <div class="kg-btns"><button id="kg-reheat">重新激活布局</button><button id="kg-fit">适应视图</button></div>
      </div></details>
      <details><summary>数据规模 / 颜色组</summary><div class="body">
        <select id="kg-size">
          ${['0', '300', '1000', '3000'].map(v => `<option value="${v}" ${v === n ? 'selected' : ''}>${v === '0' ? '示例知识库（约 70 节点）' : `示例 + ${v} 合成节点`}</option>`).join('')}
        </select>
        <div class="kg-legend" style="margin-top:10px">${legend}</div>
      </div></details>
      ${opts.note ? `<details><summary>方案说明</summary><div class="body kg-note">${opts.note}</div></details>` : ''}`;
    document.body.appendChild(panel);

    panel.querySelectorAll('input[type=range]').forEach(el => {
      el.addEventListener('input', () => {
        const key = el.dataset.key;
        params[key] = parseFloat(el.value);
        document.getElementById('v-' + key).textContent = el.value;
        opts.onChange && opts.onChange({ ...params }, key);
      });
    });
    panel.querySelector('#kg-reheat').onclick = () => opts.onReheat && opts.onReheat();
    panel.querySelector('#kg-fit').onclick = () => opts.onFit && opts.onFit();
    panel.querySelector('#kg-size').onchange = (e) => {
      const url = new URL(location.href);
      e.target.value === '0' ? url.searchParams.delete('n') : url.searchParams.set('n', e.target.value);
      location.href = url.toString();
    };

    // FPS：统计主线程 rAF 帧率，反映拖拽/模拟时的流畅度
    const fpsEl = top.querySelector('.kg-fps');
    let frames = 0, last = performance.now();
    (function loop(now) {
      frames++;
      if (now - last >= 500) {
        const fps = Math.round(frames * 1000 / (now - last));
        fpsEl.textContent = fps + ' FPS';
        fpsEl.classList.toggle('low', fps < 45);
        frames = 0; last = now;
      }
      requestAnimationFrame(loop);
    })(last);

    console.info(`[${opts.title}] 初始化，参数`, params);
    return params;
  };
})();
