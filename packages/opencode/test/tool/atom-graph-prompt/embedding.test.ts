import fs from "fs/promises"
import path from "path"
import { expect, test } from "bun:test"
import { Env } from "../../../src/env"
import { Instance } from "../../../src/project/instance"
import {
  batchGenerateEmbeddings,
  cosineSimilarity,
  getAtomEmbedding,
  loadEmbeddingCache,
  saveEmbeddingCache,
} from "../../../src/tool/atom-graph-prompt/embedding"
import { tmpdir } from "../../fixture/fixture"

test("should generate and cache simple embeddings", async () => {
  await using tmp = await tmpdir({ git: true })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await fs.mkdir(path.join(tmp.path, "atom_list"), { recursive: true })

      const cache = await loadEmbeddingCache()
      expect(cache.version).toBe("2.0")
      expect(cache.model).toBe("simple:384")
      expect(Object.keys(cache.embeddings)).toHaveLength(0)

      const embedding = await getAtomEmbedding("atom-1", "machine learning optimization", cache)
      expect(embedding).toHaveLength(384)

      const cached = await getAtomEmbedding("atom-1", "different text", cache)
      expect(cached).toEqual(embedding)

      await saveEmbeddingCache(cache)
      const loaded = await loadEmbeddingCache()
      expect(loaded.model).toBe("simple:384")
      expect(loaded.embeddings["atom-1"]?.claimEmbedding).toEqual(embedding)
    },
  })
})

test("should calculate cosine similarity correctly", async () => {
  await using tmp = await tmpdir({ git: true })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await fs.mkdir(path.join(tmp.path, "atom_list"), { recursive: true })

      const cache = await loadEmbeddingCache()
      const emb1 = await getAtomEmbedding("a1", "deep learning neural network training", cache)
      const emb2 = await getAtomEmbedding("a2", "neural network deep learning model", cache)
      const sim = cosineSimilarity(emb1, emb2)

      expect(sim).toBeGreaterThan(0)
      expect(sim).toBeLessThanOrEqual(1)
      expect(cosineSimilarity(emb1, emb1)).toBeCloseTo(1, 5)
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow("Vectors must have the same dimension")
    },
  })
})

test("should use remote embedding api when configured", async () => {
  const seen: Array<{ auth: string | null; body: any }> = []
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      seen.push({
        auth: req.headers.get("authorization"),
        body: await req.json(),
      })

      return Response.json({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      })
    },
  })

  await using tmp = await tmpdir({ git: true })

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.mkdir(path.join(tmp.path, "atom_list"), { recursive: true })
        Env.set("OPENCODE_EMBEDDING_MODEL", "openai/text-embedding-3-small")
        Env.set("OPENCODE_EMBEDDING_BASE_URL", `http://127.0.0.1:${server.port}/v1`)
        Env.set("OPENCODE_EMBEDDING_API_KEY", "test-key")

        const cache = await loadEmbeddingCache()
        const embedding = await getAtomEmbedding("remote-1", "remote text", cache)

        expect(embedding).toEqual([0.1, 0.2, 0.3])
        expect(cache.model).toContain("openai/text-embedding-3-small")
        expect(seen).toHaveLength(1)
        expect(seen[0].auth).toBe("Bearer test-key")
        expect(seen[0].body).toEqual({
          model: "text-embedding-3-small",
          input: ["remote text"],
        })
      },
    })
  } finally {
    server.stop(true)
  }
})

test("should batch generate embeddings through remote api", async () => {
  const seen: any[] = []
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const body = await req.json()
      seen.push(body)
      const input = Array.isArray(body.input) ? body.input : [body.input]

      return Response.json({
        data: input.map((_: string, idx: number) => ({
          embedding: [idx + 1, idx + 2],
        })),
      })
    },
  })

  await using tmp = await tmpdir({ git: true })

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.mkdir(path.join(tmp.path, "atom_list"), { recursive: true })
        Env.set("OPENCODE_EMBEDDING_MODEL", "openai/text-embedding-3-small")
        Env.set("OPENCODE_EMBEDDING_BASE_URL", `http://127.0.0.1:${server.port}/v1`)
        Env.set("OPENCODE_EMBEDDING_API_KEY", "test-key")

        const cache = await loadEmbeddingCache()
        await batchGenerateEmbeddings(
          [
            { atomId: "batch-1", claimText: "first claim" },
            { atomId: "batch-2", claimText: "second claim" },
            { atomId: "batch-3", claimText: "third claim" },
          ],
          cache,
        )

        expect(seen).toHaveLength(1)
        expect(seen[0]).toEqual({
          model: "text-embedding-3-small",
          input: ["first claim", "second claim", "third claim"],
        })
        expect(cache.embeddings["batch-1"]?.claimEmbedding).toEqual([1, 2])
        expect(cache.embeddings["batch-2"]?.claimEmbedding).toEqual([2, 3])
        expect(cache.embeddings["batch-3"]?.claimEmbedding).toEqual([3, 4])

        const loaded = await loadEmbeddingCache()
        expect(loaded.embeddings["batch-2"]?.claimEmbedding).toEqual([2, 3])
      },
    })
  } finally {
    server.stop(true)
  }
})

test("should fall back to simple embeddings when remote api fails", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: async () => new Response("boom", { status: 500 }),
  })

  await using tmp = await tmpdir({ git: true })

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fs.mkdir(path.join(tmp.path, "atom_list"), { recursive: true })
        Env.set("OPENCODE_EMBEDDING_MODEL", "openai/text-embedding-3-small")
        Env.set("OPENCODE_EMBEDDING_BASE_URL", `http://127.0.0.1:${server.port}/v1`)
        Env.set("OPENCODE_EMBEDDING_API_KEY", "test-key")

        const cache = await loadEmbeddingCache()
        const embedding = await getAtomEmbedding("fallback-1", "fallback text", cache)

        expect(embedding).toHaveLength(384)
        expect(cache.model).toBe("simple:384")

        await saveEmbeddingCache(cache)
        const loaded = await loadEmbeddingCache()
        expect(loaded.model).toBe("simple:384")
        expect(loaded.embeddings["fallback-1"]?.claimEmbedding).toEqual(embedding)
      },
    })
  } finally {
    server.stop(true)
  }
})
