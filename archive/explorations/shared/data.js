// 虚构知识库：大模型（LLM）主题笔记，模拟 Obsidian 双链关系
// 所有方案共用此数据：window.KG_DATA = { nodes:[{id,label,group,degree}], links:[{source,target}] }
// URL 参数 ?n=500 / ?n=2000 会追加随机合成节点，用于压测流畅度
(function () {
  const GROUPS = {
    core:  { name: '核心',       color: '#8b5cf6' },
    arch:  { name: '模型架构',   color: '#3b82f6' },
    train: { name: '训练',       color: '#10b981' },
    infer: { name: '推理部署',   color: '#f59e0b' },
    app:   { name: '应用',       color: '#ec4899' },
    eval:  { name: '评测与安全', color: '#ef4444' },
    model: { name: '模型家族',   color: '#06b6d4' },
    misc:  { name: '合成节点',   color: '#9ca3af' },
  };

  // 分组 -> 笔记标题
  const NOTES = {
    core:  ['LLM', '大模型工作原理', 'LLM 底层技术原理', 'LLM 能力边界和局限性'],
    arch:  ['Transformer', 'Attention 注意力机制', 'Self-Attention', '多头注意力', '位置编码', 'RoPE', 'MoE 混合专家',
            'FFN 前馈网络', 'LayerNorm', 'KV Cache', 'Tokenizer 分词器', 'BPE', 'Embedding'],
    train: ['大模型训练流程', '预训练', 'SFT 监督微调', 'RLHF', 'DPO', '奖励模型', 'LoRA', 'QLoRA', '数据清洗',
            'Synthetic Data 合成数据', 'Scaling Law', '混合精度训练', '分布式训练', 'ZeRO'],
    infer: ['量化', 'INT4 / INT8', 'vLLM', 'PagedAttention', '投机解码', 'Temperature 温度', 'Top-p 采样',
            '大模型上下文', '长上下文', 'LLM API 参数解析'],
    app:   ['RAG 检索增强', '向量数据库', 'Chunk 切分', 'Rerank 重排序', 'Agent 智能体', 'Function Calling',
            'MCP 协议', 'Prompt 工程', 'CoT 思维链', 'Few-shot', '知识图谱', '本体 Ontology'],
    eval:  ['Hallucination 幻觉', '评测基准', 'MMLU', '对齐 Alignment', '越狱攻击', '调用LLM API时的数据安全问题', '红队测试'],
    model: ['GPT', 'Claude', 'Llama', 'Qwen', 'DeepSeek', 'BERT'],
  };

  // 双链关系（无向）
  const EDGES = [
    // 核心辐射
    ['LLM', '大模型工作原理'], ['LLM', 'LLM 底层技术原理'], ['LLM', 'LLM 能力边界和局限性'], ['LLM', 'Transformer'],
    ['LLM', 'Hallucination 幻觉'], ['LLM', 'Scaling Law'], ['LLM', 'Embedding'], ['LLM', '大模型训练流程'],
    ['LLM', '大模型上下文'], ['LLM', 'LLM API 参数解析'], ['LLM', 'GPT'], ['LLM', 'Claude'], ['LLM', 'Llama'],
    ['LLM', 'Qwen'], ['LLM', 'DeepSeek'], ['LLM', 'MoE 混合专家'], ['LLM', '调用LLM API时的数据安全问题'],
    ['LLM', 'RAG 检索增强'], ['LLM', 'Agent 智能体'], ['LLM', 'Prompt 工程'],
    ['大模型工作原理', 'Transformer'], ['大模型工作原理', 'Tokenizer 分词器'], ['LLM 底层技术原理', 'Attention 注意力机制'],
    ['LLM 能力边界和局限性', 'Hallucination 幻觉'], ['LLM 能力边界和局限性', '长上下文'],
    // 架构
    ['Transformer', 'Attention 注意力机制'], ['Attention 注意力机制', 'Self-Attention'], ['Self-Attention', '多头注意力'],
    ['Transformer', '位置编码'], ['位置编码', 'RoPE'], ['Transformer', 'FFN 前馈网络'], ['FFN 前馈网络', 'MoE 混合专家'],
    ['Transformer', 'LayerNorm'], ['Attention 注意力机制', 'KV Cache'], ['Tokenizer 分词器', 'BPE'],
    ['Tokenizer 分词器', 'Embedding'], ['Transformer', 'BERT'], ['Transformer', 'GPT'], ['RoPE', '长上下文'],
    // 训练
    ['大模型训练流程', '预训练'], ['大模型训练流程', 'SFT 监督微调'], ['大模型训练流程', 'RLHF'], ['RLHF', '奖励模型'],
    ['RLHF', 'DPO'], ['SFT 监督微调', 'LoRA'], ['LoRA', 'QLoRA'], ['QLoRA', '量化'], ['预训练', '数据清洗'],
    ['预训练', 'Synthetic Data 合成数据'], ['预训练', 'Scaling Law'], ['预训练', '分布式训练'], ['分布式训练', 'ZeRO'],
    ['分布式训练', '混合精度训练'], ['RLHF', '对齐 Alignment'], ['DeepSeek', 'MoE 混合专家'], ['Qwen', 'SFT 监督微调'],
    // 推理部署
    ['量化', 'INT4 / INT8'], ['vLLM', 'PagedAttention'], ['PagedAttention', 'KV Cache'], ['vLLM', '投机解码'],
    ['LLM API 参数解析', 'Temperature 温度'], ['LLM API 参数解析', 'Top-p 采样'], ['大模型上下文', '长上下文'],
    ['大模型上下文', 'KV Cache'], ['Llama', 'vLLM'], ['Llama', '量化'],
    // 应用
    ['RAG 检索增强', '向量数据库'], ['RAG 检索增强', 'Chunk 切分'], ['RAG 检索增强', 'Rerank 重排序'],
    ['RAG 检索增强', 'Embedding'], ['向量数据库', 'Embedding'], ['RAG 检索增强', 'Hallucination 幻觉'],
    ['Agent 智能体', 'Function Calling'], ['Agent 智能体', 'MCP 协议'], ['Function Calling', 'MCP 协议'],
    ['Prompt 工程', 'CoT 思维链'], ['Prompt 工程', 'Few-shot'], ['Agent 智能体', 'CoT 思维链'],
    ['知识图谱', '本体 Ontology'], ['知识图谱', 'RAG 检索增强'], ['知识图谱', 'Embedding'], ['Claude', 'MCP 协议'],
    // 评测与安全
    ['评测基准', 'MMLU'], ['LLM', '评测基准'], ['对齐 Alignment', '越狱攻击'], ['越狱攻击', '红队测试'],
    ['调用LLM API时的数据安全问题', '红队测试'], ['Claude', '对齐 Alignment'], ['GPT', 'RLHF'], ['Hallucination 幻觉', '评测基准'],
  ];

  const nodes = [];
  const index = new Map();
  for (const [group, list] of Object.entries(NOTES)) {
    for (const label of list) {
      const n = { id: label, label, group, degree: 0 };
      nodes.push(n);
      index.set(label, n);
    }
  }
  const links = [];
  for (const [s, t] of EDGES) {
    if (!index.has(s) || !index.has(t)) {
      console.warn('[KG_DATA] 跳过未定义节点的连线:', s, '->', t);
      continue;
    }
    links.push({ source: s, target: t });
  }

  // ---- 压测：追加合成节点（伪随机、可复现）----
  const extra = Math.max(0, parseInt(new URLSearchParams(location.search).get('n') || '0', 10) || 0);
  if (extra > 0) {
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const base = nodes.slice();
    for (let i = 0; i < extra; i++) {
      const id = `笔记-${i + 1}`;
      nodes.push({ id, label: id, group: 'misc', degree: 0 });
      // 优先挂到已有节点上，形成类似真实笔记库的长尾结构
      const pool = i > 20 && rand() < 0.6 ? nodes : base;
      const parent = pool[Math.floor(rand() * (pool.length - 1))];
      links.push({ source: id, target: parent.id });
      if (rand() < 0.25) links.push({ source: id, target: nodes[Math.floor(rand() * (nodes.length - 1))].id });
    }
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  // 去重 + 去自环
  const seen = new Set();
  const cleanLinks = [];
  for (const l of links) {
    if (l.source === l.target) continue;
    const key = [l.source, l.target].sort().join('||');
    if (seen.has(key)) continue;
    seen.add(key);
    cleanLinks.push(l);
    byId.get(l.source).degree++;
    byId.get(l.target).degree++;
  }

  // 邻接表，供悬停高亮使用
  const neighbors = new Map(nodes.map(n => [n.id, new Set()]));
  for (const l of cleanLinks) {
    neighbors.get(l.source).add(l.target);
    neighbors.get(l.target).add(l.source);
  }

  window.KG_GROUPS = GROUPS;
  window.KG_DATA = { nodes, links: cleanLinks, neighbors };
  // 节点半径：按度数开方，类似 Obsidian
  window.KG_radius = (n) => 3 + Math.sqrt(n.degree) * 2.2;
  window.KG_color = (n) => GROUPS[n.group].color;
  // 深拷贝一份（很多库会原地修改 nodes/links）
  window.KG_clone = () => ({
    nodes: nodes.map(n => ({ ...n })),
    links: cleanLinks.map(l => ({ ...l })),
  });
  console.info(`[KG_DATA] 节点 ${nodes.length}，连线 ${cleanLinks.length}（合成 ${extra}）`);
})();
