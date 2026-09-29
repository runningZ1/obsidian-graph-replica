module.exports = {
  prefix: 'var ',
  rename: {
    i0: 'i18nGraph', r0: 'GraphCorePlugin', o0: 'VIEW_TYPE_GRAPH', a0: 'GraphView', s0: 'VIEW_TYPE_LOCALGRAPH',
    l0: 'LocalGraphView', c0: 'sliderToForce', u0: 'forceToSlider', h0: 'GraphDataEngine', p0: 'GraphControlSection',
    d0: 'FilterSection', f0: 'ColorGroupSection', m0: 'DisplaySection', v0: 'DEFAULT_DISPLAY_OPTIONS',
    g0: 'DEFAULT_FORCE_OPTIONS', y0: 'ForceSection',
  },
  external: {
    v$: 'GraphRenderer', m$: 'buildLocalGraph', a$: 'DEFAULT_GRAPH_FILTER', s$: 'createNodeData',
    Ag: 'setIcon', Zg: 'setTooltip', Yb: 'Setting', Ml: 'debounce', uy: 'Keymap', rd: 'Platform',
    GD: 'TFile', Aw: 'Notice', my: 'Menu', ky: 'ItemView', bd: 'i18n',
  },
};

module.exports.header = `/**
 * Obsidian 1.13.7 · 关系图谱 · 插件 / 视图 / 数据引擎 / 控制面板源码（app.js 第 133770–135070 行，prettier 格式化后）
 *
 * 来源：%APPDATA%/obsidian/obsidian-1.13.7.asar → app.js
 * 处理：Babel 作用域安全重命名 + 中文注释；逻辑未做任何改动。对照用的原始版本见 02-graph-plugin.raw.js
 * 版权：Obsidian 闭源（UNLICENSED），仅供个人学习分析，请勿公开传播。
 *
 * 本段包含：
 *   GraphCorePlugin              核心插件 "graph"：命令、视图注册、文件右键菜单、配置读写
 *   GraphView / LocalGraphView   全局 / 局部图谱视图
 *   sliderToForce / forceToSlider  滑块 ↔ 物理参数的对数映射
 *   GraphDataEngine              数据引擎：控制面板、搜索、MetadataCache → 图数据、播放动画、节点事件
 *   GraphControlSection 及其子类 FilterSection / ColorGroupSection / DisplaySection / ForceSection
 *
 * 仍为压缩名的外部符号（含义为推断）：
 *   y / b / v = TypeScript __awaiter / __generator / __extends
 *   AP = 搜索查询（与全局搜索同一解析器，有 matcher / match / matchTag / matchFilepath / requiredInputs）
 *   PP = 在任务队列上分批执行搜索的函数（带 beforePause 回调）；Rw = 可暂停、可取消的任务队列
 *   Cb(path) = 是否为非 Markdown 文件（附件）；MD(cache) = 取文件的全部标签；Tv(fn, ms) = setTimeout
 *   xI / n0 = 文件视图基类；iR / nR / oR = 树形控件相关基类
 */
`;

module.exports.locals = {
  'GraphDataEngine.render': { e: 'self', t: 'self2', n: 'app', i: 'view', r: 'renderer', o: 'queries',
    a: 'fileFilter', s: 'options', l: 'isLocal', c: 'graphData', u: 'itemCount', h: 'focusedNode' },
  'GraphDataEngine.render/(graphData)': { e: 'metadataCache', t: 'opts', n: 'filter', i: 'progression',
    r: 'resolvedLinks', o: 'unresolvedLinks', a: 'vault', s: 'showAttachments', l: 'hideUnresolved', c: 'showTags',
    u: 'tagCase', h: 'tags', p: 'tag', d: 'nodes', f: 'count', v: 'files', m: 'fileTime', b: 'filePath', w: 'file',
    k: 'cutoffFile', M: 'path', S: 'isAttachment', x: 'type', T: 'filterResult', D: 'nodeData', A: 'links',
    P: 'dests', I: 'dest', L: 'destIsAttachment', R: 'tagName', N: 'cutoffIndex' },
  'GraphDataEngine.setQuery': { e: 'queryList', t: 'self', n: 'parsed', i: 'requiredInputs', a: 'item', s: 'query',
    l: 'fileFilter', c: 'queue', u: 'app', h: 'lastRenderTime', p: 'hasNewResults' },
  'GraphDataEngine.updateSearch': { e: 'queries', t: 'searchText' },
  'GraphDataEngine.load': { e: 'self', t: 'app', n: 'view', i: 'vault', r: 'workspace', o: 'metadataCache',
    a: 'lastSavedScale', s: 'KEY_MAP', l: 'onKey' },
};

module.exports.comments = {
  GraphCorePlugin: '核心插件 "graph"（默认启用）',
  'GraphCorePlugin.init': `注册：
- 功能区按钮（lucide-git-fork）打开全局图谱
- 命令 graph:open（Mod+G）、graph:open-local（需要有活动文件）、graph:animate（播放动画，需要活动视图是全局图谱）
- 视图类型 "graph" → GraphView，"localgraph" → LocalGraphView`,
  'GraphCorePlugin.onEnable': `读取 .obsidian/graph.json 到 this.options
注册悬停预览来源 "graph"（defaultMod: true → 需要按住 Ctrl/Cmd 才弹出预览）`,
  'GraphCorePlugin.onFileMenu': 'Markdown 文件的右键菜单里加入“打开局部图谱”（在右侧分屏打开）',
  'GraphCorePlugin.openGraphView': '打开全局图谱（按住修饰键时在新标签页打开）',
  'GraphCorePlugin.openLocalGraph': '为当前活动文件在右侧分屏打开局部图谱',
  'GraphCorePlugin.saveOptions': '把 options 写回 .obsidian/graph.json',
  GraphView: `全局图谱视图
构造时创建 GraphRenderer(contentEl, useIframe = !iOS, hidePowerTag = true) 和 GraphDataEngine`,
  'GraphView.onload': 'metadataCache 的 resolved 事件 → update()；读取插件保存的配置并立即执行一次搜索',
  'GraphView.onOptionsChange': '控制面板变化时，把引擎的配置写回插件并保存到 graph.json',
  LocalGraphView: `局部图谱视图：跟随当前文件
配置保存在工作区布局里（getState / setState），而不是 graph.json；每个局部图谱面板各自独立`,
  'LocalGraphView.update': '当前文件变化时重置平移，设置 options.localFile 并重新 render',
  sliderToForce: `滑块值 → 物理参数（对数曲线）：(t^(1−v) − t) / (1 − t)，t = 0.01
向心力和吸引力的有效范围横跨 0.001～1，线性滑块会让大半行程都没有意义`,
  forceToSlider: '物理参数 → 滑块值（上面的反函数），用于从默认值 0.1 反推滑块位置 ≈ 0.5187',

  GraphDataEngine: '图谱数据引擎：控制面板 + 搜索/颜色组 + 由 MetadataCache 构建图数据 + 播放动画 + 节点交互回调',
  'GraphDataEngine.constructor': `- onOptionsChange：100ms 防抖后通知视图保存配置
- requestUpdateSearch：250ms 防抖后执行搜索
- 创建控制面板 .graph-controls：关闭 / 打开（齿轮）/ 播放动画（仅全局图谱）/ 恢复默认 四个按钮
- 四个分组：筛选、颜色组、外观、力度，并应用默认值`,
  'GraphDataEngine.load': `订阅事件：
- vault create / modify（非 md 文件）→ recomputeFile；rename、metadataCache resolve → recomputeFile
- css-change → renderer.testCSS()，重新读取主题颜色
- file-open → 更新当前焦点文件（节点标为 focused）
- 每 2 秒检查一次 targetScale，变化了才保存配置（而不是每次滚轮都写盘）
- 键盘：↑↓←→ 平移，+/- 缩放，Shift 加速；只在本视图是活动面板且焦点在 body 上时生效`,
  'GraphDataEngine.onCssChange': '主题或 CSS 片段变化 → 重新读取颜色',
  'GraphDataEngine.updateSearch': '组合查询：搜索框（不带颜色 = 过滤）+ 各颜色组（带颜色 = 只上色），交给 setQuery',
  'GraphDataEngine.setQuery': `分批异步搜索：
1. 取消上一次的队列；用全局搜索的解析器解析每个查询，无效的查询丢弃
2. 没有有效查询 → 清空 fileFilter 并直接 render
3. 否则把库里所有文件放进可暂停的任务队列，逐个文件匹配：
   - 不匹配某个过滤查询 → 不可见，结束
   - 匹配某个颜色组 → 记下颜色，结束（第一个匹配的颜色组生效）
   - fileFilter[path] = 可见 ? (颜色 || true) : false
4. beforePause：每 333ms 如果有新结果就 render 一次 → 大库搜索时图谱逐步更新，界面不冻结`,
  'GraphDataEngine.render': `构建图数据并交给渲染器（核心方法），返回节点 + 连线的计数（播放动画用）
内部的 graphData(...) 立即执行函数就是“MetadataCache → 图”的全部逻辑：
- 播放动画中（progression > 0）：文件按 min(ctime, mtime) 排序；每加入一个节点或一条连线计数 +1，
  计数达到 progression 时记下当前文件，最后删除排在它之后的所有文件
- 附件：未开启时跳过所有非 md 文件
- filter(路径, 类型)：笔记看 fileFilter；标签用 matchTag；附件用 matchFilepath；未解析节点不受搜索影响
- isUserIgnored：设置中“排除的文件”不参与
- 链接来自 resolvedLinks；未解析链接来自 unresolvedLinks（type "unresolved"）；标签按小写合并大小写不同的写法
然后：局部图谱走 buildLocalGraph；关闭“孤立文件”时删除无出入边的节点；当前焦点文件标为 focused`,
  'GraphDataEngine.renderProgression': `播放动画：
progression 从 1 开始，速度 = clamp(0.5·√总数, 5, 100) 个/秒
每次 setTimeout(0) 后计算应显示的数量，变化了就 render；数量不再增长或被打断时结束`,
  'GraphDataEngine.onFileChanged': '非 Markdown 文件变化 → 重新计算搜索结果',
  'GraphDataEngine.recomputeFile': '把文件加入搜索队列重新匹配',
  'GraphDataEngine.onFileOpen': '打开文件 → 更新焦点文件并重新 render（该节点显示为强调色）',
  'GraphDataEngine.onNodeClick': '点击节点：文件 → openLinkText（修饰键 = 新标签页）；标签 → 打开全局搜索 tag:xxx',
  'GraphDataEngine.onNodeRightClick': '右键节点：弹出与文件菜单同结构的菜单（title / open / action / info / view.linked / danger 等分区）',
  'GraphDataEngine.onNodeHover': '悬停节点：触发 hover-link 事件（页面预览，默认需要按住 Ctrl/Cmd）',
  'GraphDataEngine.onNodeUnhover': '移出节点：关闭悬停预览',
  'GraphDataEngine.getOptions': '收集四个分组的配置 + 缩放 scale + 面板是否关闭 close → 用于保存到 graph.json',
  'GraphDataEngine.setOptions': '应用配置（打开视图时从 graph.json 读取）',
  GraphControlSection: '控制面板分组的基类：可折叠的标题 + setting 项；折叠状态保存为 collapse-xxx',
  FilterSection: '“筛选”分组：搜索框、标签、附件、仅显示存在的文件、孤立文件；局部图谱另有深度、出链、反链、相邻链接',
  ColorGroupSection: '“颜色组”分组：每组 = 查询 + 颜色；“新建组”按钮；可拖动调整顺序（顺序决定优先级）',
  DisplaySection: '“外观”分组：箭头、文本透明度(−3～3)、节点大小(0.1～5)、连线粗细(0.1～5)、播放动画按钮（仅全局图谱）',
  DEFAULT_DISPLAY_OPTIONS: '外观默认值',
  DEFAULT_FORCE_OPTIONS: '力度默认值：向心力滑块 forceToSlider(0.1) ≈ 0.5187，排斥力 10，吸引力 forceToSlider(1) = 1，连线长度 250',
  ForceSection: `“力度”分组：
向心力 → sliderToForce(v, 0.01)；排斥力 → v³（10 → 1000）；吸引力 → sliderToForce(v, 0.01)；连线长度 → 原值(30～500)`,
};
