const { PISTON_RUNTIMES } = require('./languages')

const PISTON_URL = process.env.PISTON_URL || 'http://localhost:2000/api/v2/execute'

async function runCode(languageId, code, stdin) {
  const runtime = PISTON_RUNTIMES[languageId]
  if (!runtime) {
    return { error: `Unsupported language: ${languageId}` }
  }

  const response = await fetch(PISTON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: runtime.language,
      version: runtime.version,
      files: [{ name: runtime.filename, content: code ?? '' }],
      stdin: stdin ?? '',
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return { error: `Execution service error (${response.status}): ${text.slice(0, 200)}` }
  }

  const data = await response.json()
  const compile = data.compile
  const run = data.run ?? {}

  return {
    stdout: run.stdout ?? '',
    stderr: [compile && compile.stderr, run.stderr].filter(Boolean).join('\n'),
    exitCode: typeof run.code === 'number' ? run.code : null,
  }
}

module.exports = { runCode }
