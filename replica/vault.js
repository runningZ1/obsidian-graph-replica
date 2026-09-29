// 虚构 Obsidian 笔记库：文件夹 / 标签 / 附件 / 未解析链接 / 孤立笔记 / 创建时间
// 输出 window.VAULT = { files: [{ name, path, kind:'md'|'attachment', tags:[], links:[], ctime }] }
// URL 参数 ?scale=1|3|8 控制库规模（默认 1，约 600 个文件）
(function () {
  const scale = Math.max(1, Math.min(20, parseInt(new URLSearchParams(location.search).get('scale') || '1', 10) || 1));
  let seed = 20240101;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pickN = (arr, k) => { const out = new Set(); while (out.size < Math.min(k, arr.length)) out.add(pick(arr)); return [...out]; };

  const files = new Map();
  let clock = Date.parse('2023-06-01T09:00:00');
  const tick = (h = 6) => (clock += Math.floor(rand() * h * 3600e3) + 600e3);
  function addNote(name, folder, tags = [], links = []) {
    if (files.has(name)) { const f = files.get(name); f.links.push(...links); f.tags.push(...tags); return f; }
    const f = { name, path: `${folder}/${name}.md`, kind: 'md', tags: [...tags], links: [...links], ctime: tick() };
    files.set(name, f);
    return f;
  }
  function addAttachment(owner) {
    const d = new Date(tick(1));
    const pad = (x) => String(x).padStart(2, '0');
    const name = `Pasted image ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    files.set(name, { name, path: `附件/${name}`, kind: 'attachment', tags: [], links: [], ctime: clock });
    owner.links.push(name);
  }

  // ---- 1. AI / LLM 簇：复用 concepts-data.js 的概念与关系 ----
  const FOLDER = { core: 'AI/LLM', arch: 'AI/模型架构', train: 'AI/训练', infer: 'AI/推理部署', app: 'AI/应用', eval: 'AI/评测与安全', model: 'AI/模型家族' };
  const kg = window.KG_DATA;
  const clean = (s) => s.replace(/[\\/:*?"<>|]/g, ' ').trim();
  for (const n of kg.nodes.filter(n => n.group !== 'misc')) addNote(clean(n.label), FOLDER[n.group], ['#AI', n.group === 'model' ? '#模型' : '#LLM']);
  for (const l of kg.links) {
    const s = files.get(clean(l.source)), t = clean(l.target);
    if (s && files.has(t)) s.links.push(t);
  }

  // ---- 2. 其他主题簇：hub 笔记 + 概念笔记 ----
  const CLUSTERS = [
    { folder: 'Java/基础', tag: '#Java', hub: 'Java', items: ['面向对象', '封装', '继承', '多态', '抽象类', '接口', '泛型', '反射', '注解', '异常处理', 'String', 'StringBuilder', 'equals 与 hashCode', 'Lambda', 'Stream API', 'Optional', 'IO 流', 'NIO', '序列化'] },
    { folder: 'Java/集合', tag: '#Java', hub: 'Java 集合', items: ['ArrayList', 'LinkedList', 'HashMap', 'ConcurrentHashMap', 'TreeMap', 'HashSet', 'LinkedHashMap', 'PriorityQueue', 'ArrayDeque', '红黑树', 'fail-fast', 'Iterator'] },
    { folder: 'Java/并发', tag: '#Java', hub: 'Java 并发', items: ['线程池', 'ThreadLocal', 'synchronized', 'volatile', 'CAS', 'AQS', 'ReentrantLock', 'CountDownLatch', 'CompletableFuture', 'JMM 内存模型', '死锁', '虚拟线程'] },
    { folder: 'Java/JVM', tag: '#Java', hub: 'JVM', items: ['类加载机制', '双亲委派', '运行时数据区', '垃圾回收', 'G1', 'ZGC', 'JIT', '内存泄漏排查', 'OOM', 'JVM 调优'] },
    { folder: '后端/数据库', tag: '#数据库', hub: 'MySQL', items: ['索引', 'B+ 树', '聚簇索引', '覆盖索引', '事务', 'ACID', 'MVCC', '隔离级别', '锁机制', '慢查询优化', 'explain', '分库分表', '主从复制', 'binlog', 'redo log', 'undo log'] },
    { folder: '后端/中间件', tag: '#中间件', hub: 'Redis', items: ['缓存穿透', '缓存雪崩', '缓存击穿', '持久化 RDB', 'AOF', '哨兵', 'Redis Cluster', '分布式锁', '跳表', 'Kafka', '消息队列', '消息幂等', 'RocketMQ', 'Elasticsearch', '倒排索引'] },
    { folder: '后端/框架', tag: '#框架', hub: 'Spring', items: ['IoC', 'AOP', 'Bean 生命周期', '循环依赖', 'Spring Boot', '自动配置', 'Spring MVC', 'MyBatis', 'Spring Cloud', '微服务', '网关', '服务注册与发现', '熔断降级', 'Docker', 'Kubernetes'] },
    { folder: '计算机基础', tag: '#基础', hub: '计算机网络', items: ['TCP 三次握手', '四次挥手', 'HTTP', 'HTTPS', 'TLS', 'DNS', 'CDN', 'WebSocket', '操作系统', '进程与线程', '虚拟内存', '零拷贝', 'epoll', '数据结构', '动态规划', '二分查找', '排序算法', '图算法'] },
    { folder: '产品', tag: '#产品', hub: '产品方法论', items: ['用户调研', '需求分析', 'PRD 写作', '竞品分析', '用户画像', 'MVP', 'A/B 测试', '北极星指标', '增长黑客', 'AARRR', '商业模式画布', '原型设计', '交互设计', '数据埋点'] },
    { folder: 'Obsidian', tag: '#工具', hub: 'Obsidian 使用技巧', items: ['双向链接', 'Callout', 'Canvas', 'Dataview', 'Templater', '关系图谱', '块引用', '嵌入', 'Excalidraw', 'PARA 方法', '卡片盒笔记法', 'MOC 地图'] },
    { folder: 'AI/Prompt', tag: '#Prompt', hub: 'Prompt 模板库', items: ['角色扮演 Prompt', '结构化输出 Prompt', '代码审查 Prompt', '翻译 Prompt', '写作润色 Prompt', 'System Prompt 设计', 'Prompt 注入防御', 'Claude Code 使用笔记', 'Cursor 使用笔记', 'AI 编程工作流'] },
  ];
  for (const c of CLUSTERS) {
    const hub = addNote(c.hub, c.folder, [c.tag, '#MOC']);
    const names = c.items.map(i => addNote(i, c.folder, [c.tag]).name);
    names.forEach((n, i) => {
      hub.links.push(n);
      if (rand() < 0.45) files.get(n).links.push(names[(i + 1 + Math.floor(rand() * 3)) % names.length]);
      if (rand() < 0.08) files.get(n).tags.push('#面试');
    });
  }
  // 跨簇链接
  const CROSS = [['LLM', 'Java'], ['RAG 检索增强', 'Elasticsearch'], ['向量数据库', '索引'], ['Agent 智能体', 'AI 编程工作流'],
    ['Prompt 工程', 'Prompt 模板库'], ['知识图谱', '双向链接'], ['知识图谱', '关系图谱'], ['vLLM', 'Kubernetes'], ['Kafka', '消息队列'],
    ['HashMap', '红黑树'], ['ConcurrentHashMap', 'CAS'], ['线程池', '虚拟线程'], ['分布式锁', 'Redis'], ['MCP 协议', 'Claude Code 使用笔记'],
    ['产品方法论', 'Agent 智能体'], ['数据埋点', 'A/B 测试'], ['B+ 树', '数据结构'], ['epoll', 'NIO'], ['零拷贝', 'Kafka']];
  for (const [s, t] of CROSS) if (files.has(s) && files.has(t)) files.get(s).links.push(t);

  // ---- 3. 面试题 / 读书笔记 / 日记（随规模放大）----
  // 真实笔记库的链接大多留在同一主题内，跨主题链接很少 -> 图谱呈现“簇 + 放射”结构
  const md = () => [...files.values()].filter(f => f.kind === 'md');
  const concepts = md().map(f => f.name);
  const topicOf = (name) => files.get(name).path.split('/')[0];
  const byTopic = new Map();
  for (const c of concepts) { const t = topicOf(c); if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(c); }
  const sameTopic = (name, k) => pickN(byTopic.get(topicOf(name)), k);

  const Q = ['原理', '面试题', '常见问题', '源码分析', '最佳实践', '踩坑记录', '学习笔记', '对比总结'];
  for (let i = 0; i < 90 * scale; i++) {
    const base = pick(concepts);
    // 重名时 addNote 会合并到已有笔记
    const f = addNote(`${base} ${pick(Q)}`, files.get(base).path.split('/').slice(0, -1).join('/'), ['#待整理']);
    f.links.push(base, ...(rand() < 0.25 ? sameTopic(base, 1) : []));
  }
  const days = 60 * scale;
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse('2024-01-01') + i * 86400e3 * (rand() < 0.5 ? 1 : 2));
    const f = addNote(`${d.toISOString().slice(0, 10)} 日记`, '日记', ['#日记']);
    const main = pick(concepts);
    f.links.push(main, ...(rand() < 0.4 ? sameTopic(main, 1) : []));
  }
  const BOOKS = ['《深入理解 Java 虚拟机》', '《高性能 MySQL》', '《Redis 设计与实现》', '《人人都是产品经理》', '《卡片笔记写作法》', '《动手学深度学习》', '《设计数据密集型应用》'];
  for (const b of BOOKS) { const main = pick(concepts); addNote(b, '读书笔记', ['#读书']).links.push(...sameTopic(main, 3 + Math.floor(rand() * 3))); }

  // ---- 4. 附件、未解析链接、孤立笔记 ----
  for (const f of md()) {
    const r = rand();
    if (r < 0.22) addAttachment(f);
    if (r < 0.07) addAttachment(f);
    if (r < 0.02) addAttachment(f);
  }
  const TODO = ['Mamba 架构', 'GraphRAG', '多模态大模型', 'Netty', 'Service Mesh', 'OKR 管理', '第二大脑', 'Zettelkasten 进阶', 'Raft 协议', 'Paxos'];
  for (const t of TODO) pick(md()).links.push(t);              // 指向不存在的笔记 -> 未解析节点
  for (let i = 0; i < 12 * scale; i++) addNote(`未命名 ${i + 1}`, '收件箱', []);   // 孤立笔记

  // 去重
  for (const f of files.values()) {
    f.links = [...new Set(f.links)].filter(l => l !== f.name);
    f.tags = [...new Set(f.tags)];
  }
  window.VAULT = { files: [...files.values()] };
  console.info(`[VAULT] 生成 ${files.size} 个文件（scale=${scale}）`);
})();
