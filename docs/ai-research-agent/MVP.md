# AI 科研助手 - 第一阶段开发目标（MVP）

## 阶段目标

验证**原子网络 + 实验验证**的核心工作流，构建最小可用版本。

---

## 功能范围

### P0 - 必须包含

| 功能        | 描述                                          |
| ----------- | --------------------------------------------- |
| 课题创建    | 支持名称、研究背景、最终目标                  |
| 原子管理    | 创建、编辑、删除原子                          |
| 原子关系    | 建立 depends_on / supports / contradicts 关系 |
| 知识图谱    | 可视化原子网络，支持交互                      |
| 实验执行    | 触发实验 → 本地执行 → 结果归档                |
| SQLite 存储 | 所有数据持久化到 .research/research.db        |

### P1 - 尽量包含

| 功能       | 描述                           |
| ---------- | ------------------------------ |
| 代码项目   | 添加本地代码目录，实验引用代码 |
| 远程服务器 | SSH 远程执行实验               |

### 不包含（后续阶段）

- 文献管理
- 课题级 AI 对话
- 批量导入
- 里程碑管理

---

## 数据模型详细设计

### 1. 课题表 (projects)

**用途**：存储课题的基本信息

**字段设计**：

| 字段       | 类型    | 必填 | 说明                                                            |
| ---------- | ------- | ---- | --------------------------------------------------------------- |
| id         | TEXT    | 是   | 主键，课题唯一标识 (如: proj_xxx)                               |
| name       | TEXT    | 是   | 课题名称                                                        |
| background | TEXT    | 否   | 研究背景，描述课题的研究背景和动机                              |
| goal       | TEXT    | 否   | 最终目标，描述课题要达成的目标                                  |
| status     | TEXT    | 是   | 课题状态：active(进行中) / completed(已完成) / archived(已归档) |
| created_at | INTEGER | 是   | 创建时间 (Unix timestamp)                                       |
| updated_at | INTEGER | 是   | 更新时间 (Unix timestamp)                                       |

**业务规则**：

- id 采用 UUID 或 ULID 生成
- created_at 和 updated_at 自动管理
- status 默认值为 "active"

**示例数据**：

```json
{
  "id": "proj_001",
  "name": "Transformer效率优化",
  "background": "Transformer在NLP领域取得了巨大成功，但其自注意力机制的时间复杂度为O(N²)，限制了其在长序列场景中的应用",
  "goal": "在保持模型性能的前提下，将时间复杂度从O(N²)降低到O(N)",
  "status": "active",
  "created_at": 1704067200,
  "updated_at": 1704153600
}
```

### 2. 原子表 (atoms)

**用途**：存储课题中的知识原子

**字段设计**：

| 字段            | 类型    | 必填 | 说明                                              |
| --------------- | ------- | ---- | ------------------------------------------------- |
| id              | TEXT    | 是   | 主键，原子唯一标识                                |
| project_id      | TEXT    | 是   | 外键，关联课题                                    |
| type            | TEXT    | 是   | 类型：observation/method/hypothesis/theorem/other |
| custom_type     | TEXT    | 否   | 自定义类型名称（type=other时使用）                |
| title           | TEXT    | 是   | 原子标题                                          |
| content         | TEXT    | 是   | 原子详细内容，支持 Markdown                       |
| validation_plan | TEXT    | 否   | 验证计划，支持 Markdown                           |
| evidence        | TEXT    | 否   | 验证证据/结果，支持 Markdown                      |
| status          | TEXT    | 是   | 验证状态：pending/validating/validated/rejected   |
| created_at      | INTEGER | 是   | 创建时间                                          |
| updated_at      | INTEGER | 是   | 更新时间                                          |

**字段说明**：

| 字段            | 说明                                       |
| --------------- | ------------------------------------------ |
| content         | 原子本身的描述，比如"假设内容"、"方法说明" |
| validation_plan | 如何验证这个原子，验证方法描述             |
| evidence        | 验证后的结果、证据                         |

**示例数据**：

```json
{
  "id": "atom_001",
  "project_id": "proj_001",
  "type": "hypothesis",
  "title": "剪枝方法A比方法B更有效",
  "content": "在相同参数量下，使用剪枝方法A的模型准确率高于方法B约3-5%",
  "validation_plan": "## 验证方法\n\n1. 在 WikiText-103 数据集上训练两种模型\n2. 对比验证集准确率\n3. 使用 t-test 检验显著性",
  "evidence": "## 验证结果\n\n- 方法A准确率: 92.3%\n- 方法B准确率: 88.7%\n- 提升: 3.6%\n- p-value: 0.023 (显著)",
  "status": "validated",
  "created_at": 1704067200,
  "updated_at": 1704153600
}
```

### 3. 原子会话表 (atom_sessions)

**用途**：记录针对原子的 AI 对话历史，支持多轮讨论

**字段设计**：

| 字段       | 类型    | 必填 | 说明                   |
| ---------- | ------- | ---- | ---------------------- |
| id         | TEXT    | 是   | 主键，session 唯一标识 |
| atom_id    | TEXT    | 是   | 外键，关联原子         |
| project_id | TEXT    | 是   | 外键，关联课题         |
| title      | TEXT    | 否   | 对话标题/摘要          |
| messages   | TEXT    | 是   | 对话消息数组（JSON）   |
| created_at | INTEGER | 是   | 创建时间               |
| updated_at | INTEGER | 是   | 更新时间               |

**messages 结构**：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "这个假设的验证方法合理吗？",
      "timestamp": 1704067200
    },
    {
      "role": "assistant",
      "content": "建议添加对照组实验...",
      "timestamp": 1704067300
    }
  ]
}
```

**与原子的关系**：

```
atom (原子)
    │
    └── atom_sessions (多个对话)
         ├── session_001: "验证方法讨论"
         └── session_002: "实验设计优化"
```

### 4. 验证任务表 (verification_tasks)

**用途**：管理原子的验证任务，方便 Agent 自动执行

**字段设计**：

| 字段           | 类型    | 必填 | 说明                                   |
| -------------- | ------- | ---- | -------------------------------------- |
| id             | TEXT    | 是   | 主键，任务唯一标识                     |
| atom_id        | TEXT    | 是   | 外键，关联原子                         |
| project_id     | TEXT    | 是   | 外键，关联课题                         |
| priority       | INTEGER | 是   | 优先级，数字越小越优先                 |
| status         | TEXT    | 是   | 状态：pending/running/completed/failed |
| dependency_ids | TEXT    | 否   | 依赖的其他任务 ID（JSON 数组）         |
| scheduled_at   | INTEGER | 否   | 计划执行时间                           |
| started_at     | INTEGER | 否   | 开始时间                               |
| completed_at   | INTEGER | 否   | 完成时间                               |
| error_message  | TEXT    | 否   | 错误信息                               |
| created_at     | INTEGER | 是   | 创建时间                               |
| updated_at     | INTEGER | 是   | 更新时间                               |

**示例数据**：

```json
{
  "id": "vt_001",
  "atom_id": "atom_001",
  "project_id": "proj_001",
  "priority": 1,
  "status": "pending",
  "dependency_ids": ["vt_002", "vt_003"],
  "scheduled_at": null,
  "started_at": null,
  "completed_at": null,
  "error_message": null,
  "created_at": 1704067200,
  "updated_at": 1704067200
}
```

### 5. 原子关系表 (atom_relations)

**用途**：维护原子之间的逻辑关系

**字段设计**：

| 字段           | 类型    | 必填 | 说明                                    |
| -------------- | ------- | ---- | --------------------------------------- |
| id             | TEXT    | 是   | 主键，关系唯一标识                      |
| project_id     | TEXT    | 是   | 外键，关联课题                          |
| source_atom_id | TEXT    | 是   | 源原子 ID                               |
| target_atom_id | TEXT    | 是   | 目标原子 ID                             |
| relation_type  | TEXT    | 是   | 关系类型                                |
| custom_type    | TEXT    | 否   | 自定义类型（relation_type=other时使用） |
| description    | TEXT    | 否   | 关系描述                                |
| created_at     | INTEGER | 是   | 创建时间                                |

**relation_type 关系类型**：

| 类型        | 含义                         |
| ----------- | ---------------------------- |
| depends_on  | 依赖（A依赖B，B是A的前提）   |
| supports    | 支持（A支持B，A为B提供证据） |
| contradicts | 反驳（A反驳B）               |
| other       | 其他（用户自定义）           |

**示例数据**：

```json
{
  "id": "rel_001",
  "project_id": "proj_001",
  "source_atom_id": "atom_001",
  "target_atom_id": "atom_002",
  "relation_type": "depends_on",
  "description": "假设1需要先验证观察1",
  "created_at": 1704067200
}
```

### 6. 实验表 (experiments)

### 7. 代码项目表 (codeProjects) - P1

```typescript
export const codeProjects = sqliteTable("research_code_projects", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }),
})
```

### 8. 服务器表 (servers) - P1

```typescript
export const servers = sqliteTable("research_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'ssh' | 'docker'
  endpoint: text("endpoint").notNull(),
  credentialsJson: text("credentials_json").notNull(),
  resourcesJson: text("resources_json").notNull(),
})
```

---

## 目录结构

### 服务端 (packages/opencode/src/research/)

```
packages/opencode/src/
└── research/
    ├── index.ts                  # 模块入口
    ├── research.sql.ts          # Drizzle Schema
    ├── routes/
    │   ├── project.ts           # 课题 API
    │   ├── atom.ts              # 原子 API
    │   ├── experiment.ts        # 实验 API
    │   └── server.ts            # 服务器 API
    ├── storage/
    │   └── index.ts             # 数据库操作
    └── services/
        └── experiment.ts        # 实验执行服务
```

### Web UI (packages/app/src/pages/research/)

```
packages/app/src/
└── pages/
    └── research/
        ├── index.tsx             # 课题列表页
        ├── project.tsx           # 课题总览（4栏布局）
        ├── atom.tsx              # 原子编辑页
        └── graph.tsx             # 知识图谱页
```

---

## 实施计划

### Step 1: 项目基础架构 (1周)

**服务端**：

- [ ] 在 `packages/opencode/src/research/` 创建目录结构
- [ ] 配置 Drizzle + SQLite
- [ ] 创建数据库表 (projects)
- [ ] 实现课题 CRUD API

**前端**：

- [ ] 在 `packages/app/src/pages/research/` 创建目录结构
- [ ] 添加科研页面路由

### Step 2: 原子系统 (1周)

**服务端**：

- [ ] 创建 atoms, atomRelations 表
- [ ] 实现原子 CRUD API
- [ ] 实现原子关系 CRUD API
- [ ] 实现依赖检查

**前端**：

- [ ] 原子列表页面
- [ ] 原子创建/编辑页面
- [ ] 关系管理界面

### Step 3: 图谱可视化 (1周)

**服务端**：

- [ ] 提供图谱数据 API

**前端**：

- [ ] 集成 React Flow
- [ ] 渲染原子节点（按类型区分颜色）
- [ ] 渲染关系边（按类型区分样式）
- [ ] 交互功能（点击节点、拖拽）

### Step 4: 实验系统 (1周)

**服务端**：

- [ ] 创建 experiments 表
- [ ] 实现实验 CRUD API
- [ ] 本地执行实验（使用 OpenCode bash tool）

**前端**：

- [ ] 实验列表页面
- [ ] 实验详情页面（输出日志）
- [ ] 触发验证按钮

### Step 5: 远程服务器 - P1 (1周)

**服务端**：

- [ ] 创建 servers 表
- [ ] 实现服务器管理 API
- [ ] SSH 连接池
- [ ] 远程执行实验

**前端**：

- [ ] 服务器配置页面
- [ ] 服务器选择 UI

### Step 6: 集成测试 (1周)

- [ ] 完整工作流测试
- [ ] Bug 修复
- [ ] 文档完善

---

## 交付物

### 1. Web 界面

- 课题创建/编辑页面
- 知识图谱页面（交互式）
- 实验详情页面

### 2. CLI 命令

```bash
# 课题
research init <name>              # 创建课题
research settings                 # 编辑课题设置

# 原子
research atom create            # 创建原子
research atom edit <id>          # 编辑原子
research atom delete <id>       # 删除原子

# 关系
research rel add <src> <tgt> <type>  # 添加关系

# 实验
research validate <atom-id>      # 执行验证

# 服务器 - P1
research server add <name> <endpoint>  # 添加服务器
research server list              # 列出服务器
```

### 3. 数据存储

- `.research/research.db` - SQLite 数据库文件

---

## 预估时间

| 阶段            | 时间    |
| --------------- | ------- |
| 基础架构        | 1周     |
| 原子系统        | 1周     |
| 图谱可视化      | 1周     |
| 实验执行        | 1周     |
| 远程服务器 - P1 | 1周     |
| 集成测试        | 1周     |
| **总计**        | **6周** |

---

## 后续阶段（规划中）

### 第二阶段

- 文献管理模块
- 批量导入功能
- 课题级 AI 对话

### 第三阶段

- 里程碑管理
- 团队协作
