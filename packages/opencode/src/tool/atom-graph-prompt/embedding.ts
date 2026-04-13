import path from "path"
import { Instance } from "../../project/instance"
import { Filesystem } from "../../util/filesystem"

/**
 * Embedding 缓存管理（使用文件系统，不改动数据库）
 */

export interface AtomEmbedding {
  atomId: string
  claimEmbedding: number[]
  timestamp: number
}

export interface EmbeddingCache {
  version: string
  embeddings: Record<string, AtomEmbedding>
}

const CACHE_FILE = ".atom-embeddings-cache.json"
const CACHE_VERSION = "1.2"

/**
 * 获取缓存文件路径
 */
function getCachePath(): string {
  return path.join(Instance.directory, "atom_list", CACHE_FILE)
}

/**
 * 读取缓存
 */
export async function loadEmbeddingCache(): Promise<EmbeddingCache> {
  const cachePath = getCachePath()

  try {
    if (await Filesystem.exists(cachePath)) {
      const content = await Filesystem.readText(cachePath)
      const cache = JSON.parse(content) as EmbeddingCache

      // 版本检查
      if (cache.version === CACHE_VERSION) {
        return cache
      }
    }
  } catch (error) {
    console.warn("Failed to load embedding cache:", error)
  }

  // 返回空缓存
  return {
    version: CACHE_VERSION,
    embeddings: {},
  }
}

/**
 * 保存缓存
 */
export async function saveEmbeddingCache(cache: EmbeddingCache): Promise<void> {
  const cachePath = getCachePath()

  try {
    await Filesystem.write(cachePath, JSON.stringify(cache, null, 2))
  } catch (error) {
    console.warn("Failed to save embedding cache:", error)
  }
}

/**
 * 获取 atom 的 embedding（从缓存或生成新的）
 */
export async function getAtomEmbedding(atomId: string, claimText: string, cache: EmbeddingCache): Promise<number[]> {
  // 检查缓存
  const cached = cache.embeddings[atomId]
  if (cached) {
    return cached.claimEmbedding
  }

  // 生成新的 embedding
  const embedding = await generateEmbedding(claimText)

  // 更新缓存
  cache.embeddings[atomId] = {
    atomId,
    claimEmbedding: embedding,
    timestamp: Date.now(),
  }

  return embedding
}

/**
 * 生成文本的 embedding
 *
 * 使用火山引擎 doubao-embedding-vision 模型
 * 返回 2048 维向量
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return await generateVolcengineEmbedding(text)
  } catch (error) {
    console.warn("Volcengine embedding failed, falling back to simple embedding:", error)
    return await generateSimpleEmbedding(text)
  }
}

/**
 * 使用火山引擎 API 生成 embedding（带超时）
 */
async function generateVolcengineEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY
  const baseURL = "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal"
  const endpointId = "ep-20260413180208-4pz2c"

  if (!apiKey) {
    throw new Error("ARK_API_KEY or VOLCENGINE_API_KEY is required for Volcengine embeddings")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000) // 30 秒超时

  try {
    const response = await fetch(baseURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: endpointId,
        input: [{ text, type: "text" }],
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Volcengine embedding API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return data.data.embedding
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

/**
 * 简化版实现：使用 TF-IDF 风格的向量化（fallback）
 */
async function generateSimpleEmbedding(text: string): Promise<number[]> {
  // 1. 文本预处理
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // 2. 分词
  const words = normalized.split(" ")

  // 3. 生成固定维度的向量（2048维，匹配火山引擎）
  const dimension = 2048
  const vector = new Array(dimension).fill(0)

  // 4. 简单的哈希映射到向量空间
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const hash = simpleHash(word)

    // 将单词映射到多个维度
    for (let j = 0; j < 3; j++) {
      const idx = (hash + j * 127) % dimension
      vector[idx] += 1.0 / Math.sqrt(words.length)
    }
  }

  // 5. L2 归一化
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm
    }
  }

  return vector
}

/**
 * 简单的字符串哈希函数
 */
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same dimension")
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i]
    norm1 += vec1[i] * vec1[i]
    norm2 += vec2[i] * vec2[i]
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * 批量生成 embeddings（优化版，支持并发 API 调用）
 */
export async function batchGenerateEmbeddings(
  items: Array<{ atomId: string; claimText: string }>,
  cache: EmbeddingCache,
): Promise<void> {
  // 过滤出需要生成 embedding 的项
  const needsEmbedding = items.filter((item) => !cache.embeddings[item.atomId])

  if (needsEmbedding.length === 0) {
    return
  }

  console.log(`Generating embeddings for ${needsEmbedding.length} atoms using Volcengine API...`)

  try {
    // 批量处理（并发调用，每次最多 10 个）
    const batchSize = 10
    for (let i = 0; i < needsEmbedding.length; i += batchSize) {
      const batch = needsEmbedding.slice(i, i + batchSize)
      const texts = batch.map((item) => item.claimText)

      // 并发调用 API
      const embeddings = await batchGenerateVolcengineEmbeddings(texts)

      // 更新缓存
      for (let j = 0; j < batch.length; j++) {
        cache.embeddings[batch[j].atomId] = {
          atomId: batch[j].atomId,
          claimEmbedding: embeddings[j],
          timestamp: Date.now(),
        }
      }

      console.log(`  Processed ${Math.min(i + batchSize, needsEmbedding.length)}/${needsEmbedding.length} atoms`)
    }
  } catch (error) {
    console.warn("Batch embedding failed, falling back to individual generation:", error)
    // Fallback: 逐个生成
    for (const item of needsEmbedding) {
      await getAtomEmbedding(item.atomId, item.claimText, cache)
    }
  }

  // 保存缓存
  await saveEmbeddingCache(cache)
}

/**
 * 批量调用火山引擎 embedding API（带超时）
 */
async function batchGenerateVolcengineEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY
  const baseURL = "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal"
  const endpointId = "ep-20260413180208-4pz2c"

  if (!apiKey) {
    throw new Error("ARK_API_KEY or VOLCENGINE_API_KEY is required for Volcengine embeddings")
  }

  const promises = texts.map(async (text) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(baseURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: endpointId,
          input: [{ text, type: "text" }],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Volcengine batch embedding API error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      return data.data.embedding
    } catch (error) {
      clearTimeout(timeout)
      throw error
    }
  })

  return await Promise.all(promises)
}
