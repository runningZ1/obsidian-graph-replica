// 物理模拟 Worker：在独立线程里跑 d3-force，主线程只负责渲染
// 力的组合与常量按 Obsidian 1.13.7 的 Graph Worker 行为复刻：
//   forceX/forceY(向心) + forceLink(吸引/距离) + forceManyBody(排斥, distanceMin 30) + forceCollide(半径 60, 强度 0.5)
//   alpha 衰减 = d3 默认 300 步；速度每帧 ×0.6；60Hz 步进；alpha < 0.001 自动停止
//
// 加载方式：页面以普通 <script> 引入本文件，得到 window.SIM_WORKER_MAIN，
// 再把函数源码包成 Blob URL 创建 Worker。这样 file:// 直接打开也能用
// （浏览器禁止 file:// 页面用 new Worker('xxx.js') 加载本地脚本）。
function SIM_WORKER_MAIN() {
importScripts(
  'https://cdn.jsdelivr.net/npm/d3-dispatch@3.0.1/dist/d3-dispatch.min.js',
  'https://cdn.jsdelivr.net/npm/d3-quadtree@3.0.1/dist/d3-quadtree.min.js',
  'https://cdn.jsdelivr.net/npm/d3-timer@3.0.1/dist/d3-timer.min.js',
  'https://cdn.jsdelivr.net/npm/d3-force@3.0.0/dist/d3-force.min.js'
);

const ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 300);
const VELOCITY_KEEP = 0.6;
const STEP_MS = 1000 / 60;

let alpha = 1;
let alphaTarget = 0;
const params = { centerStrength: 0.1, linkStrength: 1, linkDistance: 250, repelStrength: 1000 };

const nodeById = new Map();
let nodes = [];
let links = [];

const fx = d3.forceX(0);
const fy = d3.forceY(0);
const fLink = d3.forceLink().id(d => d.id);
const baseLinkStrength = fLink.strength();            // d3 默认：1 / min(两端度数)
const fCharge = d3.forceManyBody().distanceMin(30);
const fCollide = d3.forceCollide(60).strength(0.5);
const forces = [fx, fy, fLink, fCharge, fCollide];

let needInit = false, needLinks = false, needParams = true;
let timer = null;

function applyParams() {
  fx.strength(params.centerStrength);
  fy.strength(params.centerStrength);
  fLink.strength((l, i, ls) => params.linkStrength * baseLinkStrength(l, i, ls));
  fLink.distance(params.linkDistance);
  // 排斥力至少为 1，避免完全不排斥
  fCharge.strength(-Math.max(1, Math.abs(params.repelStrength)));
}

function tick() {
  if (needLinks) { fLink.links(links); needLinks = false; needInit = true; }
  if (needInit) {
    nodes.forEach((n, i) => { n.index = i; });
    const rand = Math.random;
    forces.forEach(f => f.initialize && f.initialize(nodes, rand));
    needInit = false;
  }
  if (needParams) { applyParams(); needParams = false; }

  forces.forEach(f => f(alpha));
  for (const n of nodes) {
    if (n.fx == null) { n.vx *= VELOCITY_KEEP; n.x += n.vx; } else { n.x = n.fx; n.vx = 0; }
    if (n.fy == null) { n.vy *= VELOCITY_KEEP; n.y += n.vy; } else { n.y = n.fy; n.vy = 0; }
  }
}

function post() {
  // 坐标打包为 Float32Array 并“转移”给主线程（零拷贝）
  const buf = new Float32Array(nodes.length * 2);
  const ids = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    ids[i] = n.id;
    buf[2 * i] = n.x;
    buf[2 * i + 1] = n.y;
  }
  postMessage({ ids, buffer: buf.buffer }, [buf.buffer]);
}

function loop() {
  timer = null;
  if (alpha <= 0.001) return;                         // 能量耗尽，停止
  schedule();
  if (nodes.length === 0) return;
  alpha += (alphaTarget - alpha) * ALPHA_DECAY;
  tick();
  post();
}
function schedule() { if (!timer) timer = setTimeout(loop, STEP_MS); }

self.onmessage = (e) => {
  const m = e.data;

  // nodes: { id: [x, y] | null }；null 表示沿用已有坐标
  if (m.nodes) {
    const next = [];
    for (const id of nodeById.keys()) if (!(id in m.nodes)) nodeById.delete(id);
    for (const id in m.nodes) {
      let n = nodeById.get(id);
      if (!n) { n = { id, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null }; nodeById.set(id, n); }
      const p = m.nodes[id];
      if (p) { n.x = p[0]; n.y = p[1]; }
      next.push(n);
    }
    nodes = next;
    needInit = true;
  }
  if (m.links) {
    links = m.links
      .filter(([s, t]) => nodeById.has(s) && nodeById.has(t))
      .map(([s, t]) => ({ source: nodeById.get(s), target: nodeById.get(t) }));
    needLinks = true;
  }
  if (m.forceNode) {
    const n = nodeById.get(m.forceNode.id);
    if (n) { n.fx = m.forceNode.x; n.fy = m.forceNode.y; }
  }
  if (m.forces) { Object.assign(params, m.forces); needParams = true; }
  if (m.alpha !== undefined && alpha < m.alpha) alpha = m.alpha;
  if (m.alphaTarget !== undefined) alphaTarget = m.alphaTarget;
  if (m.run) schedule();
};
}

if (typeof window !== 'undefined') window.SIM_WORKER_MAIN = SIM_WORKER_MAIN;   // 页面中：只导出
else SIM_WORKER_MAIN();                                                           // Worker 中直接加载时：运行
