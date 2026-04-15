import { AtomRelationTable, AtomTable, ResearchProjectTable } from "../../research/research.sql"
import { Neo4jGraph } from "../../research/neo4j"
import { Instance } from "../../project/instance"
import { Database, eq, or } from "../../storage/db"
import { Filesystem } from "../../util/filesystem"
import type { AtomContent, AtomRelationRow, AtomRow, AtomType, RelationType } from "./types"

export interface AtomFilter {
  projectId?: string
  atomIds?: string[]
  atomTypes?: AtomType[]
}

export interface RelationFilter {
  projectId?: string
  atomIds?: string[]
  atomId?: string
  relationTypes?: RelationType[]
}

export interface GraphFilter extends AtomFilter {
  relationTypes?: RelationType[]
}

export interface GraphData {
  atoms: AtomRow[]
  relations: AtomRelationRow[]
}

export interface GraphStore {
  project(): Promise<string | undefined>
  atom(atomId: string): Promise<AtomRow | undefined>
  atoms(input?: AtomFilter): Promise<AtomRow[]>
  relations(input?: RelationFilter): Promise<AtomRelationRow[]>
  content(atom: AtomRow): Promise<AtomContent>
  graph(input?: GraphFilter): Promise<GraphData>
}

const sqlite: GraphStore = {
  async project() {
    const projectId = Instance.project.id
    const row = Database.use((db) =>
      db
        .select({ research_project_id: ResearchProjectTable.research_project_id })
        .from(ResearchProjectTable)
        .where(eq(ResearchProjectTable.project_id, projectId))
        .get(),
    )
    return row?.research_project_id
  },

  async atom(atomId) {
    return Database.use((db) => db.select().from(AtomTable).where(eq(AtomTable.atom_id, atomId)).get())
  },

  async atoms(input = {}) {
    const base = input.projectId
      ? Database.use((db) =>
          db.select().from(AtomTable).where(eq(AtomTable.research_project_id, input.projectId!)).all(),
        )
      : Database.use((db) => db.select().from(AtomTable).all())

    let rows = base

    if (input.atomIds) {
      const ids = new Set(input.atomIds)
      rows = rows.filter((row) => ids.has(row.atom_id))
    }

    if (input.atomTypes && input.atomTypes.length > 0) {
      const types = new Set(input.atomTypes)
      rows = rows.filter((row) => types.has(row.atom_type as AtomType))
    }

    return rows
  },

  async relations(input = {}) {
    const base = input.atomId
      ? Database.use((db) =>
          db
            .select()
            .from(AtomRelationTable)
            .where(
              or(
                eq(AtomRelationTable.atom_id_source, input.atomId!),
                eq(AtomRelationTable.atom_id_target, input.atomId!),
              ),
            )
            .all(),
        )
      : Database.use((db) => db.select().from(AtomRelationTable).all())

    let rows = base
    let atomIds = input.atomIds

    if (!atomIds && input.projectId) {
      atomIds = (await sqlite.atoms({ projectId: input.projectId })).map((row) => row.atom_id)
    }

    if (atomIds) {
      const ids = new Set(atomIds)
      rows = rows.filter((row) => ids.has(row.atom_id_source) && ids.has(row.atom_id_target))
    }

    if (input.relationTypes && input.relationTypes.length > 0) {
      const types = new Set(input.relationTypes)
      rows = rows.filter((row) => types.has(row.relation_type as RelationType))
    }

    return rows
  },

  async content(atom) {
    let claim = ""
    let evidence = ""

    try {
      if (atom.atom_claim_path) {
        claim = await Filesystem.readText(atom.atom_claim_path)
      }
    } catch {}

    try {
      if (atom.atom_evidence_path) {
        evidence = await Filesystem.readText(atom.atom_evidence_path)
      }
    } catch {}

    return { claim, evidence }
  },

  async graph(input = {}) {
    const atoms = await sqlite.atoms(input)
    const relations = await sqlite.relations({
      atomIds: atoms.map((row) => row.atom_id),
      relationTypes: input.relationTypes,
    })

    return { atoms, relations }
  },
}

const projected: GraphStore = {
  async project() {
    return (await Neo4jGraph.projectByProjectId(Instance.project.id)) ?? sqlite.project()
  },

  async atom(atomId) {
    return (await Neo4jGraph.atom(atomId)) ?? sqlite.atom(atomId)
  },

  async atoms(input = {}) {
    return Neo4jGraph.atoms(input)
  },

  async relations(input = {}) {
    return Neo4jGraph.relations(input)
  },

  async content(atom) {
    return sqlite.content(atom)
  },

  async graph(input = {}) {
    const projectId = input.projectId ?? (await projected.project())
    const atoms = await projected.atoms({ ...input, projectId })
    const relations = await projected.relations({
      projectId,
      atomIds: atoms.map((row) => row.atom_id),
      relationTypes: input.relationTypes,
    })
    return { atoms, relations }
  },
}

export const Store = {
  async get(): Promise<GraphStore> {
    if ((await Neo4jGraph.mode()) === "neo4j" && (await Neo4jGraph.ready())) {
      return projected
    }
    return sqlite
  },
}
