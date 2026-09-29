// Obsidian 风格关系图谱渲染器（PixiJS v7）
// 行为参数取自对 Obsidian 1.13.7 的观察，代码为独立实现：
//  - 节点半径 max(8, min(3·√(度+1), 30)) × 节点大小；缩放时节点按 √(1/scale) 变化
//  - 标签字号 14 + 半径/4；标签透明度 clamp(log2(scale) + 1 − 文本透明度, 0, 1)
//  - 悬停：非相关元素淡到 0.2，颜色/透明度每帧按 0.9 系数插值
//  - 滚轮缩放 ×1.5/格，每帧按 0.85 系数追赶目标；放大以鼠标为中心，缩小以屏幕中心为中心
//  - 平移松手带惯性；节点图形懒加载（每帧最多 50 个，离视口中心近的优先）并淡入
(function () {
  const DIM = 0.2;
  const lerp = (a, b, k = 0.9) => a * k + b * (1 - k);
  const lerpColor = (a, b) =>
    (Math.round(lerp((a >> 16) & 255, (b >> 16) & 255)) << 16) +
    (Math.round(lerp((a >> 8) & 255, (b >> 8) & 255)) << 8) +
    Math.round(lerp(a & 255, b & 255));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const outside = (vp, b) => b.right < vp.left || b.left > vp.right || b.bottom < vp.top || b.top > vp.bottom;
  const box = (x, y, r) => ({ left: x - r, right: x + r, top: y - r, bottom: y + r });
  const FONT = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Inter", "Microsoft YaHei Light", "Microsoft YaHei", sans-serif';

  const COLOR_KEYS = {
    fill: 'color-fill', fillFocused: 'color-fill-focused', fillTag: 'color-fill-tag', fillUnresolved: 'color-fill-unresolved',
    fillAttachment: 'color-fill-attachment', arrow: 'color-arrow', circle: 'color-circle', line: 'color-line', text: 'color-text',
    fillHighlight: 'color-fill-highlight', lineHighlight: 'color-line-highlight',
  };

  function parseCssColor(str, opacity = 1) {
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return { rgb: 0x888888, a: opacity };
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { rgb: (p[0] << 16) | (p[1] << 8) | p[2], a: (p.length > 3 ? p[3] : 1) * opacity };
  }
  window.hexToColor = (hex) => ({ rgb: parseInt(hex.replace('#', ''), 16), a: 1 });

  // ---------------- 节点 ----------------
  class GNode {
    constructor(r, id, type) {
      this.r = r; this.id = id; this.type = type;
      this.x = null; this.y = null; this.fx = null; this.fy = null;
      this.neighbors = new Set();
      this.weight = 0; this.color = null;
      this.rendered = false; this.fadeAlpha = 0; this.moveText = 0; this.fontDirty = false;
    }
    getSize() { return this.r.opts.nodeSize * Math.max(8, Math.min(3 * Math.sqrt(this.weight + 1), 30)); }
    getFillColor() {
      const c = this.r.colors;
      if (this.r.getHighlightNode() === this) return c.fillHighlight;
      if (this.type === 'focused' && c.fillFocused.a > 0) return c.fillFocused;
      if (this.color) return this.color;
      if (this.type === 'tag') return c.fillTag;
      if (this.type === 'unresolved') return c.fillUnresolved;
      if (this.type === 'attachment') return c.fillAttachment;
      return c.fill;
    }
    textStyle() {
      return new PIXI.TextStyle({ fontSize: 14 + this.getSize() / 4, fill: this.r.colors.text.rgb, fontFamily: FONT,
        wordWrap: true, wordWrapWidth: 300, align: 'center' });
    }
    initGraphics() {
      if (this.rendered) return false;
      this.rendered = true;
      const r = this.r;
      const c = this.circle = new PIXI.Graphics();
      c.beginFill(0xffffff).drawCircle(0, 0, 100).endFill();
      c.eventMode = 'static'; c.cursor = 'pointer'; c.zIndex = 1;
      c.on('pointerdown', (e) => r.onPointerDown(this, e))
       .on('pointerover', (e) => r.onPointerOver(this, e))
       .on('pointerout', () => r.onPointerOut(this));
      const fill = this.getFillColor();
      c.tint = fill.rgb; c.alpha = 0;
      r.hanger.addChild(c);
      const t = this.text = new PIXI.Text(this.label || this.id, this.textStyle());
      t.eventMode = 'none'; t.resolution = 2; t.anchor.set(0.5, 0); t.zIndex = 2; t.alpha = 0;
      r.hanger.addChild(t);
      this.fadeAlpha = 0;
      return true;
    }
    clearGraphics() {
      if (!this.rendered) return;
      this.rendered = false;
      for (const k of ['circle', 'highlight', 'text']) {
        const g = this[k];
        if (g) { g.parent && g.parent.removeChild(g); g.destroy(); this[k] = null; }
      }
    }
    render() {
      if (!this.rendered) return;
      const r = this.r, { x, y } = this, size = this.getSize(), fill = this.getFillColor();
      const hl = r.getHighlightNode(), isHl = hl === this, ns = r.nodeScale, text = this.text;
      const related = !hl || isHl || this.neighbors.has(hl.id);
      this.fadeAlpha = lerp(this.fadeAlpha, related ? 1 : DIM);
      const nodeAlpha = this.fadeAlpha * fill.a;
      let ta = r.textAlpha * this.fadeAlpha;
      if (isHl) ta = 1;
      ta *= r.colors.text.a;
      const moveTarget = isHl ? 15 : 0;
      this.moveText = text.visible ? lerp(this.moveText, moveTarget) : moveTarget;

      const vp = r.viewport;
      const circleVis = isHl || !outside(vp, box(x, y, size * ns + 1));
      let textVis = ta > 0.001 && (isHl || !outside(vp, { left: x - 300, right: x + 300, top: y, bottom: y + 200 }));

      const c = this.circle;
      c.tint = lerpColor(c.tint, fill.rgb);
      c.visible = circleVis;
      if (circleVis) { c.x = x; c.y = y; c.scale.set(size / 100 * ns); c.alpha = nodeAlpha; }
      text.visible = textVis;
      if (textVis) {
        text.x = x; text.y = y + (size + 5) * ns + this.moveText / r.scale;
        const s = isHl && r.scale < 1 ? 1 / r.scale : ns;
        text.scale.set(s); text.alpha = ta;
      }
      if (isHl) {
        let h = this.highlight;
        if (!h) { h = this.highlight = new PIXI.Graphics(); h.eventMode = 'none'; h.zIndex = 1; r.hanger.addChild(h); }
        const w = Math.max(1, 1 / r.scale / ns), col = r.colors.circle;
        h.x = x; h.y = y; h.scale.set(ns); h.alpha = col.a;
        h.clear().lineStyle(w, col.rgb, 1).drawCircle(0, 0, size + w / 2);
      } else if (this.highlight) {
        this.highlight.parent.removeChild(this.highlight); this.highlight.destroy(); this.highlight = null;
      }
      if (this.fontDirty) { this.fontDirty = false; text.style = this.textStyle(); }
    }
  }

  // ---------------- 连线 ----------------
  class GLink {
    constructor(r, source, target) { this.r = r; this.source = source; this.target = target; this.rendered = false; }
    initGraphics() {
      if (this.rendered || !this.source.rendered || !this.target.rendered) return;
      this.rendered = true;
      const r = this.r;
      const px = this.px = new PIXI.Container();
      r.hanger.addChild(px);
      const line = this.line = new PIXI.Sprite(PIXI.Texture.WHITE);
      line.eventMode = 'none'; line.alpha = 0; line.tint = r.colors.line.rgb;
      px.addChild(line);
      const a = this.arrow = new PIXI.Graphics();
      a.eventMode = 'none'; a.alpha = 0; a.zIndex = 1;
      a.beginFill(0xffffff).moveTo(0, 0).lineTo(-4, -2).lineTo(-3, 0).lineTo(-4, 2).lineTo(0, 0).endFill();
      r.hanger.addChild(a);
    }
    clearGraphics() {
      if (!this.rendered) return;
      this.rendered = false;
      this.px.parent && this.px.parent.removeChild(this.px); this.px.destroy({ children: true });
      this.arrow.parent && this.arrow.parent.removeChild(this.arrow); this.arrow.destroy();
      this.px = this.line = this.arrow = null;
    }
    render() {
      if (!this.rendered) return;
      const r = this.r, s = this.source, t = this.target, hl = r.getHighlightNode();
      const on = s === hl || t === hl;
      let a = hl && !on ? DIM : 1;
      let arrowA = a * clamp(2 * (r.scale - 0.3), 0, 1);
      const col = on ? r.colors.lineHighlight : r.colors.line;
      a *= col.a; arrowA *= r.colors.arrow.a;
      const w = r.opts.lineSize / r.scale;
      const vis = !outside(r.viewport, {
        left: Math.min(s.x, t.x) - w, right: Math.max(s.x, t.x) + w, top: Math.min(s.y, t.y) - w, bottom: Math.max(s.y, t.y) + w });
      const line = this.line, arrow = this.arrow;
      line.alpha = lerp(line.alpha, a);
      arrow.alpha = lerp(arrow.alpha, arrowA);
      // 双向链接只画一条线（与源码一致：存在反向链接且 source.id < target.id 时本条不画线），箭头两个方向都画
      const mutualSkip = r.linkLookup.has(t.id + '\u0000' + s.id) && s.id.localeCompare(t.id) < 0;
      const drawLine = vis && !mutualSkip;
      let showArrow = r.opts.showArrow && vis && arrow.alpha > 0.001;
      this.px.visible = drawLine;
      if (!drawLine && !showArrow) { arrow.visible = false; return; }
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const rs = s.getSize() * r.nodeScale, rt = t.getSize() * r.nodeScale;
      const ang = Math.atan2(dy, dx);
      showArrow = showArrow && dist > w;
      if (drawLine) {
        const px = this.px;
        px.x = s.x + dx * rs / dist; px.y = s.y + dy * rs / dist; px.rotation = ang;
        line.x = 0; line.y = -w / 2; line.width = Math.max(0, dist - rs - rt); line.height = w;
        line.tint = lerpColor(line.tint, col.rgb);
      }
      arrow.visible = showArrow;
      if (showArrow) {
        const d = rt + 1;
        arrow.x = t.x - dx * d / dist; arrow.y = t.y - dy * d / dist; arrow.rotation = ang;
        arrow.scale.set(2 * Math.sqrt(r.opts.lineSize) / r.scale);
        arrow.tint = r.colors.arrow.rgb;
      }
    }
  }

  // ---------------- 渲染器 ----------------
  class GraphRenderer {
    constructor(containerEl, workerMain) {
      this.el = containerEl;
      this.nodes = []; this.nodeLookup = new Map();
      this.links = []; this.linkLookup = new Map();
      this.dragNode = null; this.highlightNode = null;
      this.scale = 1; this.targetScale = 1; this.nodeScale = 1; this.textAlpha = 1;
      this.panX = 0; this.panY = 0; this.panvX = 0; this.panvY = 0; this.panning = false;
      this.zoomCenterX = 0; this.zoomCenterY = 0;
      this.mouseX = null; this.mouseY = null;
      this.opts = { nodeSize: 1, lineSize: 1, textFade: 0, showArrow: false };
      this.colors = {};
      this.idleFrames = 0; this.raf = null; this.workerResults = null;
      this.onNodeClick = null; this.onNodeHover = null;

      // 用 Blob URL 创建 Worker：file:// 直接打开时浏览器不允许 new Worker('本地文件.js')
      const blobUrl = URL.createObjectURL(new Blob([`(${workerMain.toString()})()`], { type: 'text/javascript' }));
      this.worker = new Worker(blobUrl, { name: 'Graph Worker' });
      this.worker.onerror = (e) => console.error('[Graph Worker] 出错：', e.message || e);
      this.worker.onmessage = (e) => { this.workerResults = e.data; this.changed(); };

      this.readColors();
      this.initGraphics();
    }

    readColors() {
      for (const [k, cls] of Object.entries(COLOR_KEYS)) {
        const probe = document.createElement('div');
        probe.className = 'graph-view ' + cls;
        document.body.appendChild(probe);
        const cs = getComputedStyle(probe);
        const op = parseFloat(cs.opacity);
        this.colors[k] = parseCssColor(cs.color, isNaN(op) ? 1 : op);
        probe.remove();
      }
      for (const n of this.nodes) n.fontDirty = true;
      this.changed();
    }

    initGraphics() {
      const app = this.app = new PIXI.Application({
        antialias: true, backgroundAlpha: 0, autoStart: false,
        resolution: window.devicePixelRatio || 1, autoDensity: true,
        width: this.el.clientWidth, height: this.el.clientHeight,
      });
      app.ticker.stop();
      this.el.appendChild(app.view);
      const view = app.view;
      view.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      view.addEventListener('mousemove', (e) => { this.mouseX = e.offsetX; this.mouseY = e.offsetY; }, { passive: true });
      view.addEventListener('mouseout', () => { this.mouseX = this.mouseY = null; });
      view.addEventListener('contextmenu', (e) => e.preventDefault());

      // ---- 键盘：↑↓←→ 平移，+/- 缩放，Shift 加速（焦点在输入框里时不响应）----
      this.keys = {};
      const KEY_MAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', '=': 'zoomin', '+': 'zoomin', '-': 'zoomout', _: 'zoomout' };
      const onKey = (e) => {
        this.keys.shift = e.shiftKey;
        const down = e.type === 'keydown';
        if (down) {
          const el = document.activeElement;
          if (e.repeat || e.defaultPrevented || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
        }
        const action = KEY_MAP[e.key];
        if (!action) return;
        if (down) e.preventDefault();          // 避免方向键滚动页面
        this.keys[action] = down;
        this.changed();
      };
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      window.addEventListener('blur', () => { this.keys = {}; });   // 切走窗口时松开所有按键

      const hanger = this.hanger = new PIXI.Container();
      hanger.sortableChildren = true;
      hanger.eventMode = 'static';
      app.stage.addChild(hanger);
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;

      // ---- 背景拖拽平移（带惯性）----
      let panStart = null, panOrigin = null, lastMove = performance.now(), avgDt = 16;
      app.stage.on('pointerdown', (e) => {
        if (e.target !== app.stage) return;
        panStart = { x: e.global.x, y: e.global.y }; panOrigin = { x: this.panX, y: this.panY };
        this.panning = true; this.panvX = this.panvY = 0; lastMove = performance.now();
        document.body.classList.add('is-grabbing');
      });
      let downPos = null;
      this.onPointerDown = (node, e) => {
        e.stopPropagation();
        this.dragNode = node; downPos = { x: e.global.x, y: e.global.y };
        this.changed();
      };
      app.stage.on('globalpointermove', (e) => {
        const node = this.dragNode;
        if (node) {
          if (downPos) {
            const dx = e.global.x - downPos.x, dy = e.global.y - downPos.y;
            if (dx * dx + dy * dy > 25) downPos = null;   // 移动超过 5px 视为拖拽而非点击
            else return;
          }
          const p = hanger.toLocal(e.global);
          node.fx = node.x = p.x; node.fy = node.y = p.y;
          this.worker.postMessage({ alpha: 0.3, alphaTarget: 0.3, run: true, forceNode: { id: node.id, x: p.x, y: p.y } });
          this.changed();
        } else if (panStart) {
          const now = performance.now();
          const nx = panOrigin.x + e.global.x - panStart.x, ny = panOrigin.y + e.global.y - panStart.y;
          avgDt = lerp(avgDt, now - lastMove, 0.8); lastMove = now;
          this.panvX = lerp(this.panvX, nx - this.panX, 0.8);
          this.panvY = lerp(this.panvY, ny - this.panY, 0.8);
          this.setPan(nx, ny); this.changed();
        }
      });
      const up = () => {
        const node = this.dragNode;
        if (node) {
          if (downPos && this.onNodeClick) this.onNodeClick(node);
          node.fx = node.fy = null;
          this.worker.postMessage({ alphaTarget: 0, forceNode: { id: node.id, x: null, y: null } });
          this.dragNode = null; downPos = null; this.changed();
        }
        if (panStart) {
          panStart = null; this.panning = false;
          document.body.classList.remove('is-grabbing');
          const dt = performance.now() - lastMove;
          if (dt > 100) this.panvX = this.panvY = 0;           // 停顿后松手：不滑行
          else { this.panvX /= avgDt; this.panvY /= avgDt; }  // 转为 px/ms，交给惯性
          this.changed();
        }
      };
      app.stage.on('pointerup', up).on('pointerupoutside', up);

      this.onPointerOver = (node, e) => {
        if (e.pointerType === 'touch') return;
        this.highlightNode = node; this.changed();
        this.onNodeHover && this.onNodeHover(node);
      };
      this.onPointerOut = () => { this.highlightNode = null; this.changed(); this.onNodeHover && this.onNodeHover(null); };

      new ResizeObserver(() => this.onResize()).observe(this.el);
      this.onResize();
      this.setPan(this.width / 2, this.height / 2);
      this.changed();
    }

    onResize() {
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (this.width) this.setPan(this.panX + (w - this.width) / 2, this.panY + (h - this.height) / 2);
      this.width = w; this.height = h;
      this.app.renderer.resize(w, h);
      this.app.stage.hitArea = this.app.screen;
      this.changed();
    }

    onWheel(e) {
      e.preventDefault();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= 800;
      this.targetScale *= Math.pow(1.5, -d / 120);
      if (this.targetScale < this.scale) { this.zoomCenterX = 0; this.zoomCenterY = 0; }   // 缩小：以屏幕中心
      else { this.zoomCenterX = e.offsetX; this.zoomCenterY = e.offsetY; }               // 放大：以鼠标位置
      this.changed();
    }

    zoomTo(scale) { this.targetScale = scale; this.zoomCenterX = this.zoomCenterY = 0; this.changed(); }
    resetPan() { this.setPan(this.width / 2, this.height / 2); this.panvX = this.panvY = 0; this.changed(); }

    setPan(x, y) { this.panX = x; this.panY = y; this.hanger.x = x; this.hanger.y = y; }
    setScale(s) {
      this.scale = s;
      this.nodeScale = Math.sqrt(1 / s);
      this.textAlpha = clamp(Math.log2(s) + 1 - this.opts.textFade, 0, 1);
      this.hanger.scale.set(s);
    }
    updateZoom() {
      let s = this.scale;
      const target = this.targetScale = clamp(this.targetScale, 1 / 128, 8);
      let px = this.panX, py = this.panY;
      if ((s > target ? s / target : target / s) - 1 >= 0.01) {
        let cx = this.zoomCenterX, cy = this.zoomCenterY;
        if (cx === 0 && cy === 0) { cx = this.width / 2; cy = this.height / 2; }
        const wx = (cx - px) / s, wy = (cy - py) / s;
        s = lerp(s, target, 0.85);
        px = cx - wx * s; py = cy - wy * s;
        this.changed();
      }
      this.setPan(px, py);
      this.setScale(s);
    }

    setOptions(o) {
      Object.assign(this.opts, o);
      if ('nodeSize' in o) for (const n of this.nodes) n.fontDirty = true;
      this.setScale(this.scale);
      this.changed();
    }
    setForces(f) { this.worker.postMessage({ forces: f, alpha: 0.3, run: true }); }
    reheat() { this.worker.postMessage({ alpha: 1, run: true }); }
    getHighlightNode() { return this.dragNode || this.highlightNode; }

    // data: { nodes: { id: { type, color, label } }, links: [[s, t]] }
    setData(data) {
      const incoming = data.nodes;
      let changed = false, maxR2 = 0;
      const posMsg = {};
      // 1. 删除消失的节点
      for (const n of [...this.nodes]) {
        if (incoming[n.id]) { maxR2 = Math.max(maxR2, n.x * n.x + n.y * n.y); posMsg[n.id] = null; continue; }
        n.clearGraphics();
        this.nodes.splice(this.nodes.indexOf(n), 1);
        this.nodeLookup.delete(n.id);
        changed = true;
      }
      // 2. 新增 / 更新节点
      const added = [];
      for (const id in incoming) {
        const spec = incoming[id];
        let n = this.nodeLookup.get(id);
        if (n) {
          if (n.type !== spec.type) n.type = spec.type;
          n.color = spec.color || null;
          n.label = spec.label || id;
        } else {
          n = new GNode(this, id, spec.type);
          n.color = spec.color || null; n.label = spec.label || id;
          this.nodes.push(n); this.nodeLookup.set(id, n); added.push(n);
          changed = true;
        }
      }
      // 3. 连线 diff
      const want = new Set();
      for (const [s, t] of data.links) {
        if (!this.nodeLookup.has(s) || !this.nodeLookup.has(t) || s === t) continue;
        const key = s + '\u0000' + t;
        if (want.has(key)) continue;
        want.add(key);
        if (!this.linkLookup.has(key)) {
          const l = new GLink(this, this.nodeLookup.get(s), this.nodeLookup.get(t));
          this.links.push(l); this.linkLookup.set(key, l); changed = true;
        }
      }
      for (const [key, l] of [...this.linkLookup]) {
        if (want.has(key)) continue;
        l.clearGraphics(); this.linkLookup.delete(key); this.links.splice(this.links.indexOf(l), 1); changed = true;
      }
      for (const n of this.nodes) n.neighbors.clear();
      for (const l of this.links) { l.source.neighbors.add(l.target.id); l.target.neighbors.add(l.source.id); }
      // 4. 新节点初始位置：有已定位邻居则放在邻居中心附近，否则撒在现有图外圈
      if (added.length) {
        const area = 60 * added.length * 60, v = Math.sqrt(maxR2);
        const ring = Math.sqrt(area / Math.PI + v * v) - v, jitter = Math.sqrt(area);
        for (const n of added) {
          let sx = 0, sy = 0, k = 0;
          for (const id of n.neighbors) {
            const m = this.nodeLookup.get(id);
            if (m.x !== null) { sx += m.x; sy += m.y; k++; }
          }
          if (k > 0) { n.x = sx / k + (Math.random() - 0.5) * jitter; n.y = sy / k + (Math.random() - 0.5) * jitter; }
          else {
            const ang = Math.random() * 2 * Math.PI, rad = v + Math.sqrt(Math.random()) * ring;
            n.x = rad * Math.cos(ang); n.y = rad * Math.sin(ang);
          }
          posMsg[n.id] = [n.x, n.y];
        }
      }
      // 5. 权重 = 相关节点数
      for (const n of this.nodes) {
        const w = n.neighbors.size;
        if (n.weight !== w) { n.weight = w; n.fontDirty = true; changed = true; }
      }
      if (changed) {
        this.worker.postMessage({ nodes: posMsg, links: this.links.map(l => [l.source.id, l.target.id]), alpha: 0.3, run: true });
      }
      this.changed();
      console.debug(`[Graph] setData：${this.nodes.length} 节点 / ${this.links.length} 连线（新增 ${added.length}）`);
    }

    changed() { this.idleFrames = 0; this.queueRender(); }
    queueRender() { if (!this.raf) this.raf = requestAnimationFrame(() => this.frame()); }

    frame() {
      this.raf = null;
      if (this.idleFrames > 60) return;           // 连续 60 帧无变化则休眠，零 CPU 占用

      // 读取 Worker 最新坐标
      const res = this.workerResults;
      if (res) {
        this.workerResults = null;
        const buf = new Float32Array(res.buffer);
        for (let i = 0; i < res.ids.length; i++) {
          const n = this.nodeLookup.get(res.ids[i]);
          if (!n) continue;
          n.x = n.fx != null ? n.fx : buf[2 * i];
          n.y = n.fy != null ? n.fy : buf[2 * i + 1];
        }
      }
      // 平移惯性 + 键盘平移（与源码一致：速度每帧按 0.9 系数趋向“键盘方向 × 速度档”，没按键时即衰减到 0）
      const keys = this.keys;
      if (!this.panning) {
        if (this.panvX || this.panvY) this.setPan(this.panX + 1000 * this.panvX / 60, this.panY + 1000 * this.panvY / 60);
        let kx = 0, ky = 0;
        if (keys.up) ky += 1;
        if (keys.down) ky -= 1;
        if (keys.left) kx += 1;
        if (keys.right) kx -= 1;
        const speed = keys.shift ? 3 : 1;
        this.panvX = lerp(this.panvX, kx * speed); this.panvY = lerp(this.panvY, ky * speed);
        if (kx || ky) this.idleFrames = 0;
        else if (Math.abs(this.panvX) < 1e-3 && Math.abs(this.panvY) < 1e-3) this.panvX = this.panvY = 0;
        else this.idleFrames = 0;
      }
      // 键盘缩放：每帧 ×(1 + 0.03)，按住 Shift 为 0.1；以屏幕中心为中心
      if (keys.zoomin || keys.zoomout) {
        const step = 1 + (keys.shift ? 0.1 : 0.03);
        if (keys.zoomin) this.targetScale *= step;
        if (keys.zoomout) this.targetScale /= step;
        this.zoomCenterX = this.width / 2; this.zoomCenterY = this.height / 2;
        this.idleFrames = 0;
      }
      this.updateZoom();

      const s = this.scale;
      const left = -this.panX / s, top = -this.panY / s;
      this.viewport = { left, top, right: left + this.width / s, bottom: top + this.height / s };

      // 懒加载：每帧最多初始化 50 个离视口中心最近的节点 -> 从中心向外“生长”
      const cx = (this.viewport.left + this.viewport.right) / 2, cy = (this.viewport.top + this.viewport.bottom) / 2;
      const pending = [];
      for (const n of this.nodes) {
        if (n.rendered) continue;
        const d = (n.x - cx) ** 2 + (n.y - cy) ** 2;
        if (pending.length < 50 || d < pending[pending.length - 1].d) {
          pending.push({ n, d }); pending.sort((a, b) => a.d - b.d);
          if (pending.length > 50) pending.pop();
        }
      }
      if (pending.length) { for (const p of pending) p.n.initGraphics(); this.idleFrames = 0; }
      for (const l of this.links) l.initGraphics();

      for (const n of this.nodes) n.render();
      for (const l of this.links) l.render();
      this.hanger.sortChildren();
      this.app.render();
      this.idleFrames++;
      this.queueRender();

      // 鼠标已离开高亮节点范围时取消高亮（节点在移动时 pointerout 可能不触发）
      const hl = this.highlightNode;
      if (hl && this.mouseX !== null && !this.dragNode) {
        const mx = (this.mouseX - this.panX) / s, my = (this.mouseY - this.panY) / s;
        const rr = hl.getSize() * this.nodeScale + 2;
        if ((hl.x - mx) ** 2 + (hl.y - my) ** 2 > rr * rr) { this.highlightNode = null; this.idleFrames = 0; this.onNodeHover && this.onNodeHover(null); }
      }
    }
  }

  window.GraphRenderer = GraphRenderer;
})();
