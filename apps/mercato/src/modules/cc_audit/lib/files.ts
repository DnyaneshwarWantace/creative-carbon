import type { EntityManager } from '@mikro-orm/postgresql'
import { recordActivity } from './activity'

export const RECORD_FILES_ENTITY = 'cc_audit:record'

type Scope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null }

type FileMeta = { label?: string | null; version?: number; replaces?: string | null; supersededBy?: string | null; byName?: string | null; registeredAt?: string }

type FileRow = { id: string; file_name: string; mime_type: string; file_size: number; created_at: Date; storage_metadata: { ccFile?: FileMeta } | null }

export type RecordFile = { id: string; fileName: string; mimeType: string; fileSize: number; at: string; by: string | null; label: string | null; version: number; registered: boolean }

export type RecordFileGroup = RecordFile & { older: RecordFile[] }

export class FileError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export function filesRecordId(type: string, id: string): string {
  return `${type}:${id}`
}

function view(row: FileRow): RecordFile {
  const meta = row.storage_metadata?.ccFile ?? {}
  return { id: row.id, fileName: row.file_name, mimeType: row.mime_type, fileSize: Number(row.file_size), at: new Date(row.created_at).toISOString(), by: meta.byName ?? null, label: meta.label ?? null, version: meta.version ?? 1, registered: Boolean(meta.registeredAt) }
}

async function rows(ctx: Scope, type: string, id: string): Promise<FileRow[]> {
  return ctx.em.getConnection().execute<FileRow[]>(
    `select id, file_name, mime_type, file_size, created_at, storage_metadata from attachments
      where entity_id = ? and record_id = ? and tenant_id = ? and (organization_id = ? or organization_id is null)
      order by created_at desc`,
    [RECORD_FILES_ENTITY, filesRecordId(type, id), ctx.tenantId, ctx.organizationId],
  )
}

export async function recordFiles(ctx: Scope, type: string, id: string): Promise<RecordFileGroup[]> {
  const all = await rows(ctx, type, id)
  const byId = new Map(all.map((row) => [row.id, row]))
  const current = all.filter((row) => !row.storage_metadata?.ccFile?.supersededBy)
  return current.map((row) => {
    const older: RecordFile[] = []
    let previous = row.storage_metadata?.ccFile?.replaces ?? null
    const seen = new Set<string>([row.id])
    while (previous && byId.has(previous) && !seen.has(previous)) {
      seen.add(previous)
      const earlier = byId.get(previous)!
      older.push(view(earlier))
      previous = earlier.storage_metadata?.ccFile?.replaces ?? null
    }
    return { ...view(row), older }
  })
}

export async function registerFile(ctx: Scope & { userName: string | null }, input: { type: string; id: string; attachmentId: string; label?: string | null; replaces?: string | null }) {
  const all = await rows(ctx, input.type, input.id)
  const file = all.find((row) => row.id === input.attachmentId)
  if (!file) throw new FileError('That file is not attached to this record', 404)
  if (file.storage_metadata?.ccFile?.registeredAt) throw new FileError('That file is already recorded', 409)
  const old = input.replaces ? all.find((row) => row.id === input.replaces) : null
  if (input.replaces && !old) throw new FileError('The file to replace is not on this record', 404)
  if (old?.storage_metadata?.ccFile?.supersededBy) throw new FileError('That file was already replaced; refresh and try again', 409)
  if (old && old.id === file.id) throw new FileError('A file cannot replace itself', 400)
  const oldMeta = old?.storage_metadata?.ccFile ?? {}
  const label = input.label?.trim() || oldMeta.label || null
  const meta: FileMeta = { label, version: old ? (oldMeta.version ?? 1) + 1 : 1, replaces: old?.id ?? null, byName: ctx.userName, registeredAt: new Date().toISOString() }
  const connection = ctx.em.getConnection()
  await connection.execute(`update attachments set storage_metadata = coalesce(storage_metadata, '{}'::jsonb) || jsonb_build_object('ccFile', ?::jsonb) where id = ?`, [JSON.stringify(meta), file.id])
  if (old) await connection.execute(`update attachments set storage_metadata = jsonb_set(coalesce(storage_metadata, '{}'::jsonb), '{ccFile}', coalesce(storage_metadata->'ccFile', '{}'::jsonb) || jsonb_build_object('supersededBy', ?::text)) where id = ?`, [file.id, old.id])
  const name = label ? `${label} (${file.file_name})` : file.file_name
  recordActivity(ctx.em, ctx, {
    recordType: input.type,
    recordId: input.id,
    action: old ? 'file_replaced' : 'file_uploaded',
    kind: 'document',
    summary: old ? `Replaced ${old.file_name} with ${name} (version ${meta.version}; the old file is kept)` : `Attached ${name}`,
    links: [{ type: 'file', id: file.id, label: file.file_name }, ...(old ? [{ type: 'file', id: old.id, label: `${old.file_name} (old)` }] : [])],
    actorUserId: ctx.userId ?? null,
    actorName: ctx.userName,
  })
  await ctx.em.flush()
  return (await recordFiles(ctx, input.type, input.id)).find((group) => group.id === file.id) ?? null
}
