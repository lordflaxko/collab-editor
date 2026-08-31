const { spawn } = require('child_process')
const path = require('path')

const GOFMT_BIN = '/piston/packages/go/1.16.2/go/bin/gofmt'
const RUSTFMT_BIN =
  '/piston/packages/rust/1.68.2/rust-1.68.2-x86_64-unknown-linux-gnu/rustfmt-preview/bin/rustfmt'
const RUSTC_LIB_DIR =
  '/piston/packages/rust/1.68.2/rust-1.68.2-x86_64-unknown-linux-gnu/rustc/lib'
const GOOGLE_JAVA_FORMAT_JAR = path.join(
  __dirname,
  'tools',
  'google-java-format-1.19.2-all-deps.jar',
)

function runFormatter(command, args, code) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    proc.on('error', reject)
    proc.on('close', (exitCode) => {
      if (exitCode === 0) resolve(stdout)
      else reject(new Error(stderr || `${command} exited with code ${exitCode}`))
    })
    proc.stdin.write(code ?? '')
    proc.stdin.end()
  })
}

function formatPython(code) {
  return runFormatter('python', ['-m', 'black', '-q', '-'], code)
}

function formatJava(code) {
  return runFormatter(
    'java',
    [
      '--add-exports',
      'jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED',
      '--add-exports',
      'jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED',
      '--add-exports',
      'jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED',
      '--add-exports',
      'jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED',
      '--add-exports',
      'jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED',
      '--add-opens',
      'jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED',
      '-jar',
      GOOGLE_JAVA_FORMAT_JAR,
      '-',
    ],
    code,
  )
}

// Go, Rust, and C++ formatters run inside the self-hosted Piston container
// rather than on the host: gofmt/rustfmt already ship with Piston's Go/Rust
// packages, and clang-format was apt-installed into the container alongside
// them, so there's no need for separate host toolchains for those languages.
function formatGo(code) {
  return runFormatter('docker', ['exec', '-i', 'piston_api', GOFMT_BIN], code)
}

function formatRust(code) {
  return runFormatter(
    'docker',
    ['exec', '-i', '-e', `LD_LIBRARY_PATH=${RUSTC_LIB_DIR}`, 'piston_api', RUSTFMT_BIN, '--emit', 'stdout'],
    code,
  )
}

function formatCpp(code) {
  return runFormatter('docker', ['exec', '-i', 'piston_api', 'clang-format', '-style=LLVM'], code)
}

const FORMATTERS = {
  python: formatPython,
  java: formatJava,
  go: formatGo,
  rust: formatRust,
  cpp: formatCpp,
}

async function formatCode(languageId, code) {
  const formatter = FORMATTERS[languageId]
  if (!formatter) {
    throw new Error(`No server-side formatter available for "${languageId}" in this environment`)
  }
  return formatter(code)
}

module.exports = { formatCode }
