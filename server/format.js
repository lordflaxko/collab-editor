const { spawn } = require('child_process')

function formatPython(code) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', ['-m', 'black', '-q', '-'])
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `black exited with code ${code}`))
    })
    proc.stdin.write(code ?? '')
    proc.stdin.end()
  })
}

async function formatCode(languageId, code) {
  if (languageId === 'python') {
    return formatPython(code)
  }
  throw new Error(`No server-side formatter available for "${languageId}" in this environment`)
}

module.exports = { formatCode }
