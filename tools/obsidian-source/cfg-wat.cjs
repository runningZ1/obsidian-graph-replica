// WebAssembly 反汇编（04-sim-kernel.wat）的人工注释：文件头 + 每个函数前的说明
// 由 extract.cjs 在 wasm2wat 输出上套用；指令本身不做任何改动
module.exports = {
  header: ";; ============================================================================\n;; Obsidian 1.13.7 · 关系图谱 · 物理内核 WebAssembly 反汇编（sim.js 中 base64 内嵌，3322 字节）\n;; 工具：wabt wasm2wat；注释为人工补充（\";;\" 开头），指令未做任何改动\n;; 版权：Obsidian 闭源（UNLICENSED），仅供个人学习分析，请勿公开传播。\n;;\n;; 调用方：03-sim-worker.annotated.js 中的 step()\n;;   memory 布局（ptr = 0）：\n;;     [0, 20N)            Float32 × 5 / 节点：x, y, vx, vy, w（w 由 init 计算：推断为度数）\n;;     [20N, 20N + 12L)    Int32 ×3 / 连线：source, target, bias（bias 由 init 计算，推断同 d3 forceLink）\n;;     其后                 四叉树网格 / 节点链表等临时空间（JS 侧按 13N·4 + 3L·4 + 1024 字节分配）\n;;   每一步：init(仅在数据变化时) → simulate(...) → complete(..., 0.6)\n;;\n;; 指令特征：多处 f32.const 0x1.99999ap-4（= 0.1）用于两点重合时的替代距离（相当于 d3 的 jiggle，\n;;   但是确定性的）；visitCharge 中 0x1p-2 (0.25) 与 0x1.ep+4 (30) 分别对应最小距离平方的修正与 distanceMin 30 相关的运算（推断）\n;; ============================================================================\n",
  funcNotes: {
  "0": ";; ── func 0 → export \"memset\"(dst, value, len) → dst\n;;    简单的按字节填充循环（构建四叉树前清零 / 置 −1）",
  "1": ";; ── func 1 → export \"init\"(ptr, N, L)\n;;    1) 每个节点的第 5 个字段 w 清零\n;;    2) 遍历连线：两端节点的 w 各 +1（得到度数）\n;;    3) 再遍历连线：bias = w[source] / (w[source] + w[target])，写入连线的第 3 个字段\n;;       —— 与 d3 forceLink 的 bias 计算一致：度数大的一端移动得少",
  "2": ";; ── func 2 → export \"complete\"(ptr, N, velocityKeep = 0.6)\n;;    对每个节点：vx *= 0.6; vy *= 0.6; x += vx; y += vy（即 d3 的 velocityDecay = 0.4）",
  "3": ";; ── func 3 → export \"visitCharge\"(grid, level, cellIdx, nodePtr, ...)\n;;    Barnes-Hut 多体排斥：递归访问四叉树（网格金字塔）单元\n;;    单元足够远（宽度² / 距离² < theta²）时把整个单元当作一个质点施加力，否则继续细分；\n;;    叶子单元内逐个节点计算。力 ∝ strength · alpha / 距离²",
  "4": ";; ── func 4 → export \"visitCollide\"(grid, level, ..., 12 个参数)\n;;    碰撞检测：递归访问与节点包围盒相交的四叉树单元，两节点距离小于半径和时按 strength(0.5) 推开",
  "5": ";; ── func 5 → export \"manyBody\"(ptr, N, L, alpha·charge, theta = 0.9, collideStrength = 0.5)   ← 参数已由 simulate 的调用处核实\n;;    （以下步骤按指令结构解读）\n;;    1) 计算网格大小（2 的幂，使得网格数 ≥ N）\n;;    2) memset 清空网格与链表区\n;;    3) 求所有节点的包围盒，把节点放进网格单元（链表），并累加质心\n;;    4) 自底向上合并，得到多层网格金字塔（等价于完全四叉树）\n;;    5) 对每个节点调用 visitCharge（排斥），再调用 visitCollide（碰撞）",
  "6": ";; ── func 6 → export \"simulate\"(ptr, N, L, alpha, centerStrength, linkStrengthMul, linkDistance, charge, 0.9, 0.5)\n;;    （以下三步已对照指令逐条核实）\n;;    1) forceX/forceY：vx −= x·center·alpha；vy −= y·center·alpha（目标点为原点）\n;;    2) forceLink：对每条连线，按 (距离 − linkDistance)/距离 · alpha · strength 修正两端速度，\n;;       strength = linkStrengthMul / min(两端度数)，按 bias 在两端分配（与 d3 forceLink 相同）\n;;       两点重合时使用 0.1 作为替代偏移\n;;    3) 调用 manyBody(...) 完成排斥与碰撞"
},
};
