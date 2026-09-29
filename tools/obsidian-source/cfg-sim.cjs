module.exports = {
  scopeFinder: 'iife',
  header: `/**
 * Obsidian 1.13.7 · 关系图谱 · 物理 Worker 源码 sim.js（全文，prettier 格式化后）
 *
 * 来源：%APPDATA%/obsidian/obsidian-1.13.7.asar → sim.js（主线程用 new Worker("/sim.js", {name: "Graph Worker"}) 加载）
 * 处理：Babel 作用域安全重命名 + 中文注释；逻辑未做任何改动。对照用的原始版本见 03-sim-worker.raw.js
 * 版权：Obsidian 闭源（UNLICENSED），仅供个人学习分析，请勿公开传播。
 *
 * 结构：
 *   1. d3-quadtree / d3-force 的精简内联版（constant / jiggle / Quadtree ...）
 *   2. Worker 状态（alpha、力参数、节点、连线、脏标记）
 *   3. self.onmessage：接收节点 / 连线 / 力参数 / 钉住节点 / alpha
 *   4. step：优先使用 WebAssembly 内核（base64 内嵌，反汇编见 04-sim-kernel.wat），失败时退回 JS 版 d3-force
 *   5. postPositions：SharedArrayBuffer（带版本号）或 可转移 ArrayBuffer 输出坐标
 *   6. tick / schedule：60Hz setTimeout 循环，alpha ≤ 0.001 时停止
 */
`,
  rename: {
    A: 'constant', t: 'jiggle', n: 'defaultIndex', i: 'findNode', r: 'quadtreeAdd', g: 'Quad', e: 'defaultX',
    I: 'defaultY', o: 'quadtree', a: 'Quadtree', h: 'leafCopy', f: 'quadtreeProto', C: 'getX', s: 'getY',
    u: 'nextX', l: 'nextY',
    Q: 'alpha', B: 'alphaDecay', y: 'alphaTarget', c: 'centerStrength', E: 'linkStrengthMul', v: 'linkDistance',
    x: 'chargeStrength', d: 'nodesDirty', D: 'linksDirty', w: 'forcesDirty', F: 'nodeById', M: 'nodes', G: 'links',
    S: 'LCG_MOD', p: 'lcgState', U: 'random', _: 'forceX', N: 'forceY', q: 'forceLink', R: 'forceManyBody',
    k: 'forceCollide', b: 'forces', J: 'defaultLinkStrength', Y: 'postPositions', K: 'step', O: 'timer',
    X: 'STEP_MS', L: 'writePositions', m: 'useSharedBuffer', T: 'probeBuffer', Z: 'sharedBuffer', W: 'tick',
    P: 'schedule',
  },
  locals: {
    '(step)': { A: 'wasmBytes', t: 'wasmModule', n: 'wasm', i: 'memory' },
  },
  comments: {
    constant: 'd3 内部工具：返回常量函数',
    jiggle: 'd3 内部工具：两点重合时加一个极小的随机扰动，避免除以 0',
    quadtreeAdd: '以下为 d3-quadtree 的精简版（Barnes-Hut 多体力和碰撞检测都依赖四叉树）',
    nextX: '预测下一帧位置 x + vx（forceCollide 用）',
    alpha: `—— Worker 状态 ——
alpha：模拟“温度”，初始为 1
alphaDecay = 1 − 0.001^(1/300)：与 d3 默认一致，约 300 步从 1 衰减到 0.001（60Hz 下约 5 秒）
alphaTarget：alpha 的目标值（拖拽时 0.3，其余时间 0）
centerStrength 0.1 / linkStrengthMul 1 / linkDistance 250 / chargeStrength −1000：默认力参数（已经过滑块换算）
nodesDirty / linksDirty / forcesDirty：脏标记，下一步计算前才重新初始化，避免重复工作
nodeById：id → 节点对象；nodes / links：当前参与模拟的数组`,
    'self.onmessage': `消息协议（主线程 → Worker）：
- nodes: { id: [x, y] | null }  完整节点集合；[x,y] 是新节点初始坐标，null 表示沿用已有坐标；不在集合中的节点被删除
- links: [[sourceId, targetId], ...]  完整连线集合
- forceNode: { id, x, y }  钉住节点（拖拽）；x/y 为 null 表示释放
- forces: { centerStrength, linkStrength, linkDistance, repelStrength }  repelStrength 取负作为 charge，绝对值 < 1 时强制为 −1
- alpha：只会提高、不会降低；alphaTarget：直接设置；run：启动循环`,
    LCG_MOD: `—— JS 备用方案用到的变量 ——
random：线性同余随机数，种子固定为 1 → 布局可复现（d3 同款 LCG）
forceX / forceY / forceLink / forceManyBody / forceCollide：内联的 d3-force 精简版
defaultLinkStrength：forceLink 默认强度函数 1/min(两端度数)，实际强度 = linkStrengthMul × 它`,
    step: `一步物理计算。优先使用 WebAssembly 内核：
- 内核以 base64 内嵌，同步实例化（new WebAssembly.Module / Instance），没有任何真实导入
- 线性内存需求 = 13·N·4 + 3·L·4 + 1024 字节，不够时 memory.grow
- 布局：Float32 × 5 / 节点（x, y, vx, vy, 第 5 个字段由 init 写入：推断为度数）位于 [0, 20N)；
        Int32 × 3 / 连线（source, target, 第 3 个字段由 init 写入：推断为 bias）从 20N 开始；其余空间放四叉树
- 节点或连线变化时写入坐标、速度和连线索引，然后调用 init(0, N, L)
- 每步：simulate(0, N, L, alpha, center, linkMul, linkDist, charge, 0.9, 0.5) → complete(0, N, 0.6)
  推断：0.9 = Barnes-Hut 的 theta，0.5 = 碰撞强度，0.6 = 速度保留率（velocityDecay 0.4）
- 被钉住的节点用 fx/fy 覆盖、速度清零，再把 x/y/vx/vy 读回 JS 对象
任何异常 → 返回 null → 使用后面的 JS 备用方案（会打印 "Using fallback d3 simulator"）`,
    STEP_MS: '步进间隔 1000/60 ms（Worker 中没有 requestAnimationFrame，用 setTimeout，与显示器刷新率解耦）',
    writePositions: '把所有节点坐标写入 Float32Array [x0, y0, x1, y1, ...]，并返回 id 列表',
    useSharedBuffer: '探测能否使用 SharedArrayBuffer：先发一个 { ignore: true, shared } 消息，成功就启用共享内存',
    sharedBuffer: `共享内存模式：buffer 大小 = N·2·4 + 4 字节，节点数不变时复用同一块内存
末尾 4 字节是 Uint32 版本号，每次写完 +1；主线程比较版本号，没变化就不重复读取`,
    tick: `主循环：alpha > 0.001 时 → 先排下一次 → alpha += (alphaTarget − alpha)·alphaDecay → step() → postPositions()
alpha 降到 0.001 以下后完全停止，直到主线程再发 run / alpha`,
    schedule: '如果还没有排队，就 setTimeout(tick, STEP_MS)',
  },
};
