# Atom Graph Prompt 工具开发进展 (graphRAG 分支)

## 项目概述

本文档记录 graphRAG 分支的开发进展，包含 Phase 1、Phase 2 和 Phase 3.1 的完整实现。

---

## 开发时间线

### 2026-04-06 - Phase 1 & 2 初始实现 ✅

**提交**: `3329004` - feat: Add Atom Graph Prompt Tool (Phase 1 & 2)

#### Phase 1: 图遍历与基础 Prompt 生成

**实现内容**:

- BFS 图遍历算法
- GraphRAG 和 Compact 两种 prompt 模板
- 关系和类型过滤
- 自动推断起始点

**代码统计**:

- `traversal.ts`: 105 行
- `builder.ts`: 129 行（初始版本）
- `types.ts`: 36 行（初始版本）

#### Phase 2: 智能检索与评分系统

**实现内容**:

- Embedding 缓存系统
- 语义相似度搜索
- 5维度智能评分系统
- 混合检索（图遍历 + 语义搜索）
- 多样性选择算法
- 自适应 Token 预算管理
- `atom_graph_prompt_smart` 工具

**代码统计**:

- `embedding.ts`: 190 行
- `scoring.ts`: 226 行
- `hybrid.ts`: 319 行（初始版本）
- `token-budget.ts`: 268 行
- `atom-graph-prompt-smart.ts`: 新增工具

**文档**:

- 更新 `atom-graph-prompt-usage.md` 添加 Phase 2 使用指南
- 创建 `atom-graph-prompt-phase2-test-design.md` 测试设计文档

---

### 2026-04-08 - Phase 3.1 社区检测 ✅

**提交**: `ea51fac` - feat: Phase 3.1 - Community Detection with Louvain algorithm

**实现内容**:

- Louvain 算法社区检测
- 社区缓存系统（文件缓存，不改动数据库）
- 社区摘要自动生成
- 社区查询（支持自然语言）
- 社区统计信息
- 集成到 `atom_graph_prompt_smart` 工具
- 社区级别 Prompt 生成

**新增文件**:

- `community.ts`: 440 行 - 社区检测核心实现

**修改文件**:

- `types.ts`: +20 行 - 添加 Community 和 CommunityFilterOptions 类型
- `hybrid.ts`: +60 行 - 添加社区过滤支持
- `builder.ts`: +150 行 - 添加 buildCommunityPrompt() 函数
- `atom-graph-prompt-smart.ts`: +20 行 - 添加社区过滤参数

**测试文件**:

- `test/tool/atom-graph-prompt/community.test.ts`: 280 行
  - 6 个测试用例（需要修复数据库依赖）

**依赖安装**:

- `graphology@0.26.0` - 图数据结构库
- `graphology-communities-louvain@2.0.2` - Louvain 社区检测算法

**新增 API**:

```typescript
// 社区检测
detectCommunities(options?: CommunityDetectionOptions): Promise<CommunityCache>

// 社区查询
queryCommunities(options?: CommunityQueryOptions): Promise<Community[]>

// 统计信息
getCommunityStats(): Promise<CommunityStats>

// Atom 社区查询
getAtomCommunity(atomId: string): Promise<Community | null>

// 社区 Atoms 获取
getCommunityAtoms(communityId: string): Promise<string[]>

// 刷新缓存
refreshCommunities(options?: CommunityDetectionOptions): Promise<CommunityCache>

// 社区 Prompt 生成
buildCommunityPrompt(
  communities: Community[],
  atomsByCommunity: Map<string, TraversedAtom[]>,
  options: PromptBuilderOptions
): string
```

**文档更新**:

- 更新 `atom-graph-prompt-usage.md` 添加完整的 Phase 3 章节（+300 行）
  - 核心功能说明
  - API 使用示例
  - 数据结构说明
  - 缓存机制说明
  - 3 个使用场景示例
  - 算法说明
  - 最佳实践
  - 性能考虑

---

### 2026-04-08 - 文档完善 ✅

**提交**: `6184b62` - docs: update plan and add progress tracking

**更新内容**:

- 重构 `atom-graph-prompt-plan.md` 为完整的项目计划
- 创建 `atom-graph-prompt-progress.md` 记录开发进展
- 详细的 Phase 状态和代码统计
- 技术亮点和经验总结

---

## 当前状态 (graphRAG 分支)

### 代码库统计

**总代码量**: ~1,913 行（atom-graph-prompt 模块）

**文件结构**:

```
packages/opencode/src/tool/atom-graph-prompt/
├── builder.ts        (265 行) - Prompt 构建 + 社区 Prompt
├── community.ts      (440 行) - 社区检测（Phase 3.1 新增）
├── embedding.ts      (190 行) - Embedding 管理
├── hybrid.ts         (364 行) - 混合检索 + 社区过滤
├── scoring.ts        (226 行) - 智能评分
├── token-budget.ts   (268 行) - Token 预算
├── traversal.ts      (105 行) - 图遍历
└── types.ts          (55 行)  - 类型定义 + 社区类型
```

**测试文件**:

```
packages/opencode/test/tool/atom-graph-prompt/
└── community.test.ts (280 行) - 社区检测测试（待修复）
```

**文档**:

- `atom-graph-prompt-usage.md` - 完整使用指南（~800 行）
- `atom-graph-prompt-plan.md` - 开发计划
- `atom-graph-prompt-phase2-test-design.md` - Phase 2 测试设计
- `atom-graph-prompt-progress.md` - 本文档

### 功能完成度

| Phase                   | 状态      | 完成度 | 分支     |
| ----------------------- | --------- | ------ | -------- |
| Phase 1: 图遍历         | ✅ 完成   | 100%   | graphRAG |
| Phase 2: 智能检索       | ✅ 完成   | 100%   | graphRAG |
| Phase 3.1: 社区检测     | ✅ 完成   | 100%   | graphRAG |
| Phase 3.2: 社区分析增强 | 🔲 待实施 | 0%     | -        |
| Phase 4: 高级功能       | 🔲 未开始 | 0%     | -        |

---

## 技术实现亮点

### 1. 社区检测 (Phase 3.1)

**Louvain 算法**:

- 模块度优化的社区检测算法
- 支持分辨率参数调整社区粒度
- 高效处理大规模图

**社区密度计算**:

```typescript
density = 内部边数 / 最大可能边数
```

**主导类型识别**:

- 统计社区内各 atom 类型数量
- 选择数量最多的类型作为主导类型

**自动摘要生成**:

- 提取 atom 名称作为关键词
- 统计类型分布
- 生成简洁的文本摘要

### 2. 缓存策略

**Embedding 缓存**:

- 位置: `atom_list/.atom-embeddings-cache.json`
- 避免重复计算 embedding
- 版本控制支持

**社区缓存**:

- 位置: `atom_list/.atom-communities-cache.json`
- 文件缓存，不改动数据库
- 首次检测后即时响应
- 支持手动刷新

### 3. 工具集成

**社区过滤参数**:

```typescript
{
  communityIds?: string[]           // 指定社区 ID
  minCommunitySize?: number         // 最小社区大小
  maxCommunitySize?: number         // 最大社区大小
  communityDominantTypes?: AtomType[] // 主导类型过滤
}
```

**使用示例**:

```typescript
// 在智能工具中使用社区过滤
await agent.useTool("atom_graph_prompt_smart", {
  query: "模型优化方法",
  communityIds: ["community-1", "community-3"],
  maxAtoms: 10,
})
```

---

## 待完成任务

### 高优先级

1. **测试修复**
   - 修复 `community.test.ts` 的数据库依赖问题
   - 需要创建 ResearchProject 和完整的测试数据

2. **实际测试**
   - 在真实的 Atom Graph 上测试社区检测
   - 验证社区质量和摘要准确性

### 中优先级

3. **Phase 2 测试**
   - 实现 33 个测试用例（参考 phase2-test-design.md）

4. **功能增强**
   - 集成真实的 embedding API（OpenAI/HuggingFace）
   - Phase 3.2: 社区分析增强

### 低优先级

5. **性能优化**
   - 大规模图性能测试
   - 并行处理支持

6. **高级功能**
   - Phase 4.1: 时序分析
   - Phase 4.2: 推荐系统
   - Phase 4.3: 可视化

---

## 经验总结

### 成功经验

1. **模块化设计**: 每个功能独立模块，易于测试和维护
2. **文件缓存**: 避免数据库改动，降低复杂度
3. **类型安全**: 完整的 TypeScript 类型定义
4. **文档先行**: 详细的使用文档和 API 说明
5. **向后兼容**: Phase 1 功能完全兼容

### 遇到的挑战

1. **测试数据库依赖**: 需要完整的 research project 设置
   - `research_project_id` 是 NOT NULL 字段
   - 需要先创建 ResearchProject 才能创建 Atom

2. **Embedding 模拟**: 当前使用模拟数据
   - 需要集成真实的 embedding API
   - 考虑使用 OpenAI 或 HuggingFace

3. **社区质量**: 需要在实际数据上验证
   - 社区大小是否合理
   - 摘要是否准确
   - 关键词是否有代表性

### 改进方向

1. **测试覆盖**: 提高测试覆盖率到 80%+
2. **性能基准**: 建立性能基准测试
3. **用户反馈**: 在实际使用中收集反馈
4. **文档完善**: 添加更多使用示例和故障排查指南

---

## 下一步计划

### 短期（1-2 周）

1. 修复 `community.test.ts` 的数据库依赖问题
2. 在实际项目中测试 Phase 3.1 功能
3. 收集用户反馈和改进建议

### 中期（1 个月）

1. 实现 Phase 2 的完整测试套件
2. 集成真实的 embedding API
3. 开始 Phase 3.2 开发（社区间关系分析）

### 长期（3 个月）

1. 完成 Phase 3.2 社区分析增强
2. 规划 Phase 4 高级功能
3. 性能优化和大规模测试

---

## 提交历史

| 提交      | 日期       | 说明                 |
| --------- | ---------- | -------------------- |
| `3329004` | 2026-04-06 | Phase 1 & 2 初始实现 |
| `ea51fac` | 2026-04-08 | Phase 3.1 社区检测   |
| `6184b62` | 2026-04-08 | 文档更新和进展记录   |

---

## 贡献者

- **开发**: zj45
- **分支**: graphRAG
- **时间**: 2026-04-06 至 2026-04-08
- **代码量**: ~2,500 行（含测试和文档）

---

最后更新: 2026-04-08
