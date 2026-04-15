import type { TraversalOptions, TraversedAtom, RelationType } from "./types"
import { Store } from "./store"

interface QueueItem {
  atomId: string
  distance: number
  path: string[]
  relationChain: RelationType[]
}

/**
 * 使用 BFS 遍历 Atom Graph
 */
export async function traverseAtomGraph(options: TraversalOptions): Promise<TraversedAtom[]> {
  const { seedAtomIds, maxDepth, maxAtoms, relationTypes, atomTypes } = options
  const store = await Store.get()

  const visited = new Map<string, TraversedAtom>()
  const queue: QueueItem[] = []

  // 初始化队列
  for (const atomId of seedAtomIds) {
    queue.push({
      atomId,
      distance: 0,
      path: [atomId],
      relationChain: [],
    })
  }

  while (queue.length > 0 && visited.size < (maxAtoms || Infinity)) {
    const current = queue.shift()!

    if (visited.has(current.atomId) || current.distance > maxDepth) {
      continue
    }

    // 获取 atom 数据
    const atom = await store.atom(current.atomId)

    if (!atom) continue

    // 应用 atom 类型过滤
    if (atomTypes && !atomTypes.includes(atom.atom_type as any)) {
      continue
    }

    // 读取文件内容
    const { claim, evidence } = await store.content(atom)

    // 添加到已访问
    visited.set(current.atomId, {
      atom,
      claim,
      evidence,
      distance: current.distance,
      path: current.path,
      relationChain: current.relationChain,
    })

    // 如果达到最大深度，不再扩展
    if (current.distance >= maxDepth) {
      continue
    }

    // 获取邻居（双向边）。LongMemEval 会话图是顺序链，
    // 只沿出边遍历会导致命中后续 turn 时无法回到答案 turn。
    const filteredRelations = await store.relations({
      atomId: current.atomId,
      relationTypes,
    })

    // 添加邻居到队列
    for (const rel of filteredRelations) {
      const nextId = rel.atom_id_source === current.atomId ? rel.atom_id_target : rel.atom_id_source
      if (!visited.has(nextId)) {
        queue.push({
          atomId: nextId,
          distance: current.distance + 1,
          path: [...current.path, nextId],
          relationChain: [...current.relationChain, rel.relation_type as RelationType],
        })
      }
    }
  }

  return Array.from(visited.values())
}
