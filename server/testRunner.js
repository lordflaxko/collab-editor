const { readRoomFiles } = require('./gitSync')
const { PISTON_RUNTIMES } = require('./languages')

const PISTON_HTTP_URL = process.env.PISTON_HTTP_URL || 'http://localhost:2000/api/v2/execute'
const TEST_FILE_PATTERN = /\.test\.js$/

function isTestFile(name) {
  return TEST_FILE_PATTERN.test(name)
}

// Node's built-in test runner (require('node:test')) prints TAP output to
// stdout on its own the moment a test file that calls test() is run as a
// plain script -- no `--test` CLI flag or installed framework needed, which
// matters since this app's sandbox has no package manager. This picks the
// handful of TAP lines the UI actually renders out of that stream.
function parseTapOutput(stdout) {
  const tests = []
  const lines = stdout.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ok = line.match(/^ok (\d+)(?: - (.*))?$/)
    const notOk = line.match(/^not ok (\d+)(?: - (.*))?$/)
    if (notOk) {
      // Node's default TAP reporter follows a failing test with an indented
      // YAML diagnostic block (the assertion error and stack) before the
      // next top-level line -- capturing it is what makes "Debug with AI"
      // useful instead of just handing the model a bare test name.
      const detailLines = []
      let j = i + 1
      while (j < lines.length && /^\s/.test(lines[j])) {
        detailLines.push(lines[j])
        j++
      }
      tests.push({
        id: Number(notOk[1]),
        name: notOk[2]?.trim() || `test ${notOk[1]}`,
        passed: false,
        detail: detailLines.join('\n').trim(),
      })
    } else if (ok) {
      tests.push({ id: Number(ok[1]), name: ok[2]?.trim() || `test ${ok[1]}`, passed: true })
    }
  }
  const passMatch = stdout.match(/^# pass (\d+)/m)
  const failMatch = stdout.match(/^# fail (\d+)/m)
  return {
    tests,
    passed: passMatch ? Number(passMatch[1]) : tests.filter((t) => t.passed).length,
    failed: failMatch ? Number(failMatch[1]) : tests.filter((t) => !t.passed).length,
  }
}

async function runOneTestFile(testFile, otherFiles) {
  const runtime = PISTON_RUNTIMES.javascript
  const response = await fetch(PISTON_HTTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: runtime.language,
      version: runtime.version,
      // Piston runs the first file in this list; the rest are written
      // alongside it so the test file's own require('./x.js') calls resolve.
      files: [
        { name: testFile.name, content: testFile.content },
        ...otherFiles.map((f) => ({ name: f.name, content: f.content })),
      ],
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Test execution service error (${response.status})`)
  }
  const stdout = data.run?.stdout ?? ''
  const stderr = data.run?.stderr ?? ''
  const { tests, passed, failed } = parseTapOutput(stdout)
  return { file: testFile.name, tests, passed, failed, stderr, exitCode: data.run?.code ?? null }
}

async function runTests(room) {
  const files = await readRoomFiles(room)
  const testFiles = files.filter((f) => isTestFile(f.name))
  if (testFiles.length === 0) {
    throw new Error('No test files found -- name a file like example.test.js')
  }
  const results = []
  for (const testFile of testFiles) {
    const otherFiles = files.filter((f) => f.name !== testFile.name)
    results.push(await runOneTestFile(testFile, otherFiles))
  }
  return results
}

module.exports = { runTests, isTestFile }
