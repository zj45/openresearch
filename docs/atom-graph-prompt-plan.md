# Atom Graph Prompt 工具开发计划

## 项目定位

本项目的目标不是单独做一个 GraphRAG demo，而是服务于 **OpenResearch 这个 AI 辅助研究系统**：

- 用 atom graph 承载研究中的声明、证据、关系和演化过程
- 让 Agent 能围绕图谱进行检索、分析、追踪和建议
- 支持后续的实时更新与 temporal thinking

`LongMemEval` 的定位是 **验证 GraphRAG 检索有效性** 的 benchmark，而不是 roadmap 的主线功能。

---

## 当前基线

以下能力已经具备，并作为后续 Phase 1 / Phase 2 的基础：

- ✅ 图遍历与基础 prompt 构建
- ✅ 语义搜索、评分、多样性选择、token 预算
- ✅ 社区检测与社区过滤
- ✅ 真实 embedding API 接入与缓存
- ✅ 面向用户的 GraphRAG 使用文档
- ✅ 用 LongMemEval 做初步效果验证

当前 atom graph 的事实源仍然是 SQLite：

- 节点与关系定义：`packages/opencode/src/research/research.sql.ts`
- GraphRAG 读路径：`traversal.ts` / `hybrid.ts` / `community.ts`
- 变更事件：`research.atoms.updated`

---

## Phase 1：Graph Store 抽象与当前 SQLite 基线

**目标**：先把 GraphRAG 对底层图存储的依赖从“散落的 SQLite 查询”收敛成统一读层，为后续 SQLite / Neo4j 对比验证做准备。

### 设计原则

- SQLite 继续作为当前权威存储（source of truth）
- GraphRAG 不直接散读 `AtomTable` / `AtomRelationTable`
- 统一通过 `GraphStore` 抽象访问 atom graph
- Phase 1 不改变产品语义，只重构读路径和边界

### Phase 1 交付物

1. `GraphStore` 统一接口

- `project()`：解析当前 `research_project_id`
- `atom()`：读取单个 atom
- `atoms()`：按项目 / atomIds / 类型读取 atom 集合
- `relations()`：按项目 / atomIds / atomId 读取关系
- `content()`：读取 claim / evidence 文本
- `graph()`：读取项目级子图

2. SQLite 后端实现

- 当前先实现 SQLite 版本
- 不提前引入 Neo4j 双写或切换逻辑

3. GraphRAG 主读路径改造

- `traversal.ts` 改为依赖 `GraphStore`
- `hybrid.ts` 改为依赖 `GraphStore`
- `community.ts` 改为依赖 `GraphStore`

4. 保留 temporal 所需基础字段

- 所有读取继续保留 `time_created` / `time_updated`
- 为后续 temporal thinking 留出统一入口

### Phase 1 验收标准

- GraphRAG 主路径不再直接散读 SQLite 表
- 当前 GraphRAG 功能行为保持一致
- 现有 `hybrid/community` 相关测试通过
- 为 Neo4j 接入留出明确替换点

### Phase 1 状态

- ✅ 已执行：新增 `packages/opencode/src/tool/atom-graph-prompt/store.ts`
- ✅ 已执行：`traversal.ts` / `hybrid.ts` / `community.ts` 改为走统一读层

---

## Phase 2：SQLite vs Neo4j 验证、实时更新与 Temporal Thinking

**目标**：验证 atom graph 是否应该引入 Neo4j，并把这个决策建立在真实研究场景、实时更新能力和 temporal thinking 需求之上。

这不是“默认切换到 Neo4j”，而是 **验证式 Phase**。

### Phase 2 当前结论

- ✅ 已完成 Neo4j graph projection PoC、SQLite -> Neo4j backfill、项目级实时投影
- ✅ 已完成 `longmemeval-s` 上的 `SQLite GraphRAG vs Neo4j GraphRAG` 验证
- ✅ 已完成本地 Neo4j 部署与连通验证
- ⚠️ 当前结论：**暂不考虑用 Neo4j 替换 SQLite 作为 GraphRAG 默认读后端**

当前结论依据：

- Neo4j 在当前实现中没有带来足够明显的最终效果提升
- `longmemeval-s` 上 Neo4j 版本最终正确率低于 SQLite 基线
- 阶段级 profiling 表明当前瓶颈主要在 embedding，而不是 SQLite 图读取
- Neo4j 方案增加了部署、同步、一致性和调试复杂度

因此后续策略为：

- SQLite 继续作为默认事实源和默认图读后端
- Neo4j 分支作为已验证 PoC 封存保留
- 后续研发回到 `graphRAG` 主线继续推进

### Phase 2 核心问题

1. SQLite 是否已经足够支撑当前和中期的图检索需求？
2. Neo4j 是否能显著改善以下能力：
   - 多跳图遍历
   - 社区/子图分析
   - 实时投影更新
   - temporal thinking 查询表达能力
3. 引入 Neo4j 的复杂度是否值得：
   - 运行维护成本
   - 数据一致性成本
   - 开发复杂度

### Phase 2.1：Neo4j 投影 PoC

**目标**：在不改变 SQLite 事实源的前提下，建立 Neo4j graph projection。

计划内容：

- ✅ 设计 Neo4j graph schema（`ResearchProject` / `Atom` / `RELATES_TO`）
- ✅ 从 SQLite 回填一个 research project 的完整子图到 Neo4j
- ✅ 在 `GraphStore` 层新增 Neo4j 后端实现
- ✅ 支持同一批查询分别走 SQLite / Neo4j

### Phase 2.2：实时更新机制

**目标**：让 atom graph 变更可以实时同步到图读模型。

计划内容：

- ✅ 基于 `research.atoms.updated` 做项目级 projector
- ✅ 验证项目级重建子图的成本与延迟
- 🔲 视情况细化事件为 atom / relation 级别增量事件
- 🔲 明确失败重试与一致性策略

### Phase 2.3：Temporal Thinking 基础模型

**目标**：支持“图谱在某个时刻是什么样”“某条研究脉络如何演化”这类查询。

计划内容：

- 🔲 定义 temporal query 的最小能力范围
- 🔲 设计 graph change journal 或版本化方案
- 🔲 支持按时间查看 atom / relation 变化
- 🔲 为 Agent 提供 temporal thinking 所需的检索接口

### Phase 2.4：验证与决策

**目标**：给出 SQLite / Neo4j 的明确取舍建议。

验证维度：

- 🔲 查询正确性
- 🔲 多跳遍历延迟
- 🔲 社区分析成本
- 🔲 实时更新延迟
- 🔲 `longmemeval-s` 上的 GraphRAG 性能表现
- 🔲 `Neo4j GraphRAG` 在 `longmemeval-s` 上的延迟 / token / 正确率表现
- 🔲 temporal thinking 可表达性
- 🔲 维护与部署复杂度

输出结果应明确回答以下三选一：

1. 继续以 SQLite 为主，不引入 Neo4j
2. SQLite 作为事实源，Neo4j 作为图投影读模型
3. Neo4j 值得承担更高权重，但仍需额外迁移计划

当前结论：选择 **1. 继续以 SQLite 为主，不引入 Neo4j 作为默认后端**。

---

## Phase 3：长期图智能能力（保留）

**目标**：在完成 SQLite / Neo4j 的架构取舍后，继续扩展 graphRAG 的高阶分析和研究辅助能力。

Phase 3 不是当前的存储验证主线，但需要作为长期 roadmap 保留。

### Phase 3.1：社区分析增强

计划内容：

- 🔲 社区间关系分析
- 🔲 社区演化追踪
- 🔲 跨社区桥接节点识别
- 🔲 社区质量评估指标

### Phase 3.2：高级功能

计划内容：

- 🔲 Atom 创建时间线分析
- 🔲 研究进展追踪
- 🔲 知识演化可视化
- 🔲 基于社区的 atom 推荐
- 🔲 相关研究推荐
- 🔲 缺失关系推荐
- 🔲 社区结构可视化
- 🔲 知识图谱交互式浏览
- 🔲 关系强度热力图

### Phase 3.3：Memory Subagent

计划内容：

- 🔲 定义 memory agent 与 delegation 规则
- 🔲 提供图谱健康检查与批量清理能力
- 🔲 提供主动建议、重复发现、矛盾识别
- 🔲 提供面向 graphRAG / temporal thinking 的专属分析工具

---

## 验证方法

### 产品主验证

优先使用真实研究项目和研究任务进行验证：

- 研究主题发现
- 研究脉络追踪
- 跨主题桥接分析
- 实验后知识回写与图谱更新
- 时间视角下的研究演化查询

### Benchmark 验证

`LongMemEval` 只承担以下角色：

- 验证 GraphRAG 对长上下文记忆检索是否有效
- 对比 `GraphRAG vs full-context`
- 在 Phase 2 中辅助对比 `SQLite GraphRAG vs Neo4j GraphRAG`
- 对比 `SQLite GraphRAG` 与 `Neo4j GraphRAG` 在 `longmemeval-s` 上的性能指标
- 单独记录 `Neo4j GraphRAG` 在 `longmemeval-s` 上的运行耗时、上下文 token 和正确率

它不是产品 phase 的目标本身，也不决定存储架构的全部结论。

---

## 当前待办

### 已完成

- ✅ GraphRAG 基线功能
- ✅ 社区检测与社区过滤
- ✅ 真实 embedding API 接入
- ✅ LongMemEval 初步验证
- ✅ GraphStore 抽象（Phase 1）
- ✅ Neo4j PoC、backfill、实时投影与 `longmemeval-s` 验证

### 下一步

1. 基于 SQLite 继续推进 temporal thinking 的最小查询模型
2. 继续优化 GraphRAG 检索链路中的 embedding 开销
3. 在 `graphRAG` 主线继续研发，不再以 Neo4j 替换为近期目标
4. 保留 Phase 3 作为长期能力扩展路线

---

## 相关文件

- `packages/opencode/src/tool/atom-graph-prompt/store.ts` - Phase 1 图读抽象
- `packages/opencode/src/tool/atom-graph-prompt/traversal.ts` - 图遍历
- `packages/opencode/src/tool/atom-graph-prompt/hybrid.ts` - 混合检索
- `packages/opencode/src/tool/atom-graph-prompt/community.ts` - 社区检测
- `packages/opencode/src/research/research.sql.ts` - 当前 SQLite 图模型
- `packages/opencode/src/research/research.ts` - atom graph 更新事件
- `graphrag-user-guide.md` - 用户侧使用说明

---

最后更新: 2026-04-15
