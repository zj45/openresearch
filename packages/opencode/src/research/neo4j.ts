import neo4j, {
  type Driver,
  type ManagedTransaction,
  type Node,
  type Relationship,
  type Record as Row,
} from "neo4j-driver"

import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Env } from "@/env"
import { Instance } from "@/project/instance"
import { AtomRelationTable, AtomTable, ResearchProjectTable } from "@/research/research.sql"
import { Database, eq } from "@/storage/db"
import { Log } from "@/util/log"
import type { AtomRelationRow, AtomRow } from "@/tool/atom-graph-prompt/types"

const log = Log.create({ service: "neo4j" })

type Mode = "off" | "dual" | "neo4j"

type Settings = {
  uri: string
  username: string
  password: string
  database?: string
  mode: Mode
}

type Entry = {
  cfg?: Settings
  driver?: Driver
}

const state = Instance.state(
  async () => {
    const cfg = await settings()
    if (!cfg || cfg.mode === "off") return {} satisfies Entry

    const driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password), {
      disableLosslessIntegers: true,
    })

    try {
      await driver.verifyConnectivity()
      await schema(driver, cfg.database)
      return { cfg, driver } satisfies Entry
    } catch (err) {
      await driver.close().catch(() => {})
      log.warn("neo4j unavailable; falling back to sqlite", {
        uri: cfg.uri,
        err: err instanceof Error ? err.message : String(err),
      })
      return {} satisfies Entry
    }
  },
  async (entry) => {
    await entry.driver?.close()
  },
)

function text(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function nullable(value: unknown) {
  return value === undefined ? null : value
}

function toAtom(node: Node): AtomRow {
  const props = node.properties as Record<string, unknown>
  return {
    atom_id: String(props.atom_id),
    research_project_id: String(props.research_project_id),
    atom_name: String(props.atom_name),
    atom_type: String(props.atom_type) as AtomRow["atom_type"],
    atom_claim_path: text(props.atom_claim_path) ?? null,
    atom_evidence_type: String(props.atom_evidence_type || "math") as AtomRow["atom_evidence_type"],
    atom_evidence_status: String(props.atom_evidence_status || "pending") as AtomRow["atom_evidence_status"],
    atom_evidence_path: text(props.atom_evidence_path) ?? null,
    atom_evidence_assessment_path: text(props.atom_evidence_assessment_path) ?? null,
    article_id: text(props.article_id) ?? null,
    session_id: text(props.session_id) ?? null,
    time_created: num(props.time_created),
    time_updated: num(props.time_updated),
  }
}

function toRelation(rel: Relationship): AtomRelationRow {
  const props = rel.properties as Record<string, unknown>
  return {
    atom_id_source: String(props.atom_id_source),
    atom_id_target: String(props.atom_id_target),
    relation_type: String(props.relation_type) as AtomRelationRow["relation_type"],
    note: text(props.note) ?? null,
    time_created: num(props.time_created),
    time_updated: num(props.time_updated),
  }
}

function project() {
  return Database.use((db) =>
    db.select().from(ResearchProjectTable).where(eq(ResearchProjectTable.project_id, Instance.project.id)).get(),
  )
}

async function settings(): Promise<Settings | undefined> {
  const cfg = await Config.get()
  const neo = cfg.neo4j
  const uri = Env.get("OPENRESEARCH_NEO4J_URI") ?? neo?.uri
  const username = Env.get("OPENRESEARCH_NEO4J_USERNAME") ?? neo?.username
  const password = Env.get("OPENRESEARCH_NEO4J_PASSWORD") ?? neo?.password

  if (!uri || !username || !password) return

  return {
    uri,
    username,
    password,
    database: Env.get("OPENRESEARCH_NEO4J_DATABASE") ?? neo?.database,
    mode: (Env.get("OPENRESEARCH_NEO4J_MODE") ?? neo?.mode ?? "dual") as Mode,
  }
}

async function schema(driver: Driver, database?: string) {
  const opts = database ? { database } : undefined
  await driver.executeQuery(
    "CREATE CONSTRAINT research_project_id IF NOT EXISTS FOR (p:ResearchProject) REQUIRE p.research_project_id IS UNIQUE",
    {},
    opts,
  )
  await driver.executeQuery(
    "CREATE CONSTRAINT atom_id IF NOT EXISTS FOR (a:Atom) REQUIRE a.atom_id IS UNIQUE",
    {},
    opts,
  )
  await driver.executeQuery(
    "CREATE INDEX research_project_project_id IF NOT EXISTS FOR (p:ResearchProject) ON (p.project_id)",
    {},
    opts,
  )
  await driver.executeQuery(
    "CREATE INDEX atom_research_project_id IF NOT EXISTS FOR (a:Atom) ON (a.research_project_id)",
    {},
    opts,
  )
}

async function exec<T>(write: boolean, fn: (tx: ManagedTransaction) => Promise<T>) {
  const entry = await state()
  if (!entry.driver || !entry.cfg) return

  const session = entry.driver.session(entry.cfg.database ? { database: entry.cfg.database } : undefined)
  try {
    return write ? await session.executeWrite(fn) : await session.executeRead(fn)
  } finally {
    await session.close()
  }
}

function atomParams(row: AtomRow) {
  return {
    atom_id: row.atom_id,
    research_project_id: row.research_project_id,
    atom_name: row.atom_name,
    atom_type: row.atom_type,
    atom_claim_path: nullable(row.atom_claim_path),
    atom_evidence_type: row.atom_evidence_type,
    atom_evidence_status: row.atom_evidence_status,
    atom_evidence_path: nullable(row.atom_evidence_path),
    atom_evidence_assessment_path: nullable(row.atom_evidence_assessment_path),
    article_id: nullable(row.article_id),
    session_id: nullable(row.session_id),
    time_created: row.time_created,
    time_updated: row.time_updated,
  }
}

function relationParams(row: AtomRelationRow, researchProjectId: string) {
  return {
    key: `${row.atom_id_source}:${row.relation_type}:${row.atom_id_target}`,
    research_project_id: researchProjectId,
    atom_id_source: row.atom_id_source,
    atom_id_target: row.atom_id_target,
    relation_type: row.relation_type,
    note: nullable(row.note),
    time_created: row.time_created,
    time_updated: row.time_updated,
  }
}

function projectParams(row: typeof ResearchProjectTable.$inferSelect) {
  return {
    research_project_id: row.research_project_id,
    project_id: row.project_id,
    background_path: nullable(row.background_path),
    goal_path: nullable(row.goal_path),
    macro_table_path: nullable(row.macro_table_path),
    time_created: row.time_created,
    time_updated: row.time_updated,
  }
}

function load(researchProjectId: string) {
  const row = Database.use((db) =>
    db.select().from(ResearchProjectTable).where(eq(ResearchProjectTable.research_project_id, researchProjectId)).get(),
  )

  if (!row) return { row }

  const atoms = Database.use((db) =>
    db.select().from(AtomTable).where(eq(AtomTable.research_project_id, researchProjectId)).all(),
  )
  const ids = new Set(atoms.map((item) => item.atom_id))
  const relations = Database.use((db) => db.select().from(AtomRelationTable).all()).filter(
    (item) => ids.has(item.atom_id_source) && ids.has(item.atom_id_target),
  )

  return { row, atoms, relations }
}

export namespace Neo4jGraph {
  export async function mode(): Promise<Mode> {
    return (await settings())?.mode ?? "off"
  }

  export async function ready() {
    const entry = await state()
    return Boolean(entry.driver)
  }

  export async function init() {
    const cfg = await settings()
    if (!cfg || cfg.mode === "off") return

    await state()

    const row = project()
    if (row) {
      await syncProject(row.research_project_id)
    }

    Bus.subscribeAll(async (evt) => {
      if (evt.type !== "research.atoms.updated") return
      await syncProject((evt.properties as { researchProjectId: string }).researchProjectId)
    })
  }

  export async function syncProject(researchProjectId: string) {
    const entry = await state()
    if (!entry.driver) return false

    const data = load(researchProjectId)

    if (!data.row) {
      await exec(true, async (tx) => {
        await tx.run(
          `
          MATCH (p:ResearchProject {research_project_id: $researchProjectId})
          OPTIONAL MATCH (a:Atom {research_project_id: $researchProjectId})
          DETACH DELETE p, a
          `,
          { researchProjectId },
        )
      })
      return true
    }

    const atoms = data.atoms.map(atomParams)
    const atomIds = data.atoms.map((item) => item.atom_id)
    const relations = data.relations.map((item) => relationParams(item, researchProjectId))
    const keys = relations.map((item) => item.key)

    await exec(true, async (tx) => {
      await tx.run(
        `
        MERGE (p:ResearchProject {research_project_id: $project.research_project_id})
        SET p += $project
        `,
        { project: projectParams(data.row) },
      )

      await tx.run(
        `
        MATCH (a:Atom {research_project_id: $researchProjectId})
        WHERE NOT a.atom_id IN $atomIds
        DETACH DELETE a
        `,
        { researchProjectId, atomIds },
      )

      await tx.run(
        `
        MATCH ()-[r:RELATES_TO {research_project_id: $researchProjectId}]->()
        WHERE NOT r.key IN $keys
        DELETE r
        `,
        { researchProjectId, keys },
      )

      if (atoms.length > 0) {
        await tx.run(
          `
          UNWIND $atoms AS atom
          MERGE (a:Atom {atom_id: atom.atom_id})
          SET a += atom
          WITH a, atom
          MATCH (p:ResearchProject {research_project_id: atom.research_project_id})
          MERGE (p)-[:HAS_ATOM]->(a)
          `,
          { atoms },
        )
      }

      if (relations.length > 0) {
        await tx.run(
          `
          UNWIND $relations AS rel
          MATCH (s:Atom {atom_id: rel.atom_id_source})
          MATCH (t:Atom {atom_id: rel.atom_id_target})
          MERGE (s)-[r:RELATES_TO {key: rel.key}]->(t)
          SET r += rel
          `,
          { relations },
        )
      }
    })

    log.info("neo4j project sync complete", {
      researchProjectId,
      atoms: atomIds.length,
      relations: keys.length,
    })
    return true
  }

  export async function backfill(researchProjectId?: string) {
    if (!(await ready())) return false

    if (researchProjectId) return syncProject(researchProjectId)

    const current = project()
    if (current) {
      return syncProject(current.research_project_id)
    }

    const rows = Database.use((db) => db.select().from(ResearchProjectTable).all())
    for (const row of rows) {
      await syncProject(row.research_project_id)
    }
    return true
  }

  export async function projectByProjectId(projectId: string) {
    return exec(false, async (tx) => {
      const res = await tx.run(
        `
        MATCH (p:ResearchProject {project_id: $projectId})
        RETURN p.research_project_id AS id
        LIMIT 1
        `,
        { projectId },
      )
      return text(res.records[0]?.get("id"))
    })
  }

  export async function atoms(input: { projectId?: string; atomIds?: string[]; atomTypes?: string[] }) {
    const where: string[] = []
    const params: Record<string, unknown> = {}

    if (input.projectId) {
      where.push("a.research_project_id = $projectId")
      params.projectId = input.projectId
    }
    if (input.atomIds) {
      where.push("a.atom_id IN $atomIds")
      params.atomIds = input.atomIds
    }
    if (input.atomTypes && input.atomTypes.length > 0) {
      where.push("a.atom_type IN $atomTypes")
      params.atomTypes = input.atomTypes
    }

    return (
      (await exec(false, async (tx) => {
        const res = await tx.run(
          `
          MATCH (a:Atom)
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          RETURN a
          ORDER BY a.time_created ASC
          `,
          params,
        )
        return res.records.map((row: Row) => toAtom(row.get("a") as Node))
      })) ?? []
    )
  }

  export async function atom(atomId: string) {
    const rows = await atoms({ atomIds: [atomId] })
    return rows[0]
  }

  export async function relations(input: {
    projectId?: string
    atomIds?: string[]
    atomId?: string
    relationTypes?: string[]
  }) {
    const where: string[] = []
    const params: Record<string, unknown> = {}

    if (input.projectId) {
      where.push("r.research_project_id = $projectId")
      params.projectId = input.projectId
    }
    if (input.atomIds) {
      where.push("r.atom_id_source IN $atomIds AND r.atom_id_target IN $atomIds")
      params.atomIds = input.atomIds
    }
    if (input.atomId) {
      where.push("(r.atom_id_source = $atomId OR r.atom_id_target = $atomId)")
      params.atomId = input.atomId
    }
    if (input.relationTypes && input.relationTypes.length > 0) {
      where.push("r.relation_type IN $relationTypes")
      params.relationTypes = input.relationTypes
    }

    return (
      (await exec(false, async (tx) => {
        const res = await tx.run(
          `
          MATCH ()-[r:RELATES_TO]->()
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          RETURN r
          ORDER BY r.time_created ASC
          `,
          params,
        )
        return res.records.map((row: Row) => toRelation(row.get("r") as Relationship))
      })) ?? []
    )
  }
}
