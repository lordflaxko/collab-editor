import { postJson } from './api'

export interface DbQueryResult {
  rows: Record<string, unknown>[]
  fields: string[]
  rowCount: number
  truncated: boolean
}

export function runDatabaseQuery(
  room: string,
  sessionToken: string | null,
  connectionString: string,
  query: string,
): Promise<DbQueryResult> {
  return postJson('/db/query', { room, sessionToken, connectionString, query })
}
