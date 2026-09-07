const { Client } = require('pg')

const MAX_ROWS = 500
const STATEMENT_TIMEOUT_MS = 10000
const CONNECT_TIMEOUT_MS = 8000

// Read-only is enforced by Postgres itself, via a READ ONLY transaction --
// far more robust than trying to pattern-match "is this a SELECT" in
// application code, which is easy to get wrong (CTEs, SELECT ... INTO,
// multiple ;-separated statements smuggling a write after a real SELECT).
// Any write Postgres would normally allow gets rejected by the database
// itself with its own "cannot execute ... in a read-only transaction"
// error instead, and that guarantee holds for every statement inside the
// transaction, not just the first one.
//
// Credentials are never stored -- this opens one connection per request
// with whatever connection string the caller supplied and closes it
// immediately after, the same "re-enter it every time" pattern already
// used for the GitHub token in the Source Control panel's Remote tab.
//
// Worth being explicit about: this makes the server itself originate an
// outbound TCP connection to whatever host:port is in the connection
// string, on the caller's behalf. That's why the route calling this
// requires signed-in editor access on a private project only -- the same
// restriction real step-through debugging uses, and for the same reason
// (the server reaching out somewhere, not just running sandboxed code).
async function runReadOnlyQuery(connectionString, query) {
  if (!connectionString || !connectionString.trim()) {
    throw new Error('A connection string is required')
  }
  if (!query || !query.trim()) {
    throw new Error('A query is required')
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS })
  try {
    await client.connect()
  } catch (err) {
    throw new Error(`Could not connect: ${err.message}`)
  }

  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    await client.query('BEGIN READ ONLY')
    let result
    try {
      result = await client.query(query)
    } finally {
      // Always roll back rather than commit -- this is a read-only session,
      // so there's nothing that should ever need to persist, and rolling
      // back avoids leaving an open transaction behind regardless of
      // whether the query succeeded.
      await client.query('ROLLBACK').catch(() => {})
    }
    const rows = Array.isArray(result.rows) ? result.rows : []
    const truncated = rows.length > MAX_ROWS
    return {
      rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
      fields: (result.fields ?? []).map((f) => f.name),
      rowCount: rows.length,
      truncated,
    }
  } finally {
    await client.end().catch(() => {})
  }
}

module.exports = { runReadOnlyQuery }
