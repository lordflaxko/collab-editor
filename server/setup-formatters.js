// Installs/repairs the external tools the server-side formatters in
// format.js depend on. Safe to re-run any time -- each step checks whether
// its tool is already present before doing anything.
//
// Needed again whenever:
//   - a fresh machine/checkout is being set up, or
//   - the piston_api Docker container gets recreated (docker rm + run) rather
//     than just restarted, since clang-format was apt-installed into its
//     writable layer and does not live in the persisted piston_packages volume.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const GOFMT_BIN = '/piston/packages/go/1.16.2/go/bin/gofmt'
const RUSTFMT_BIN =
  '/piston/packages/rust/1.68.2/rust-1.68.2-x86_64-unknown-linux-gnu/rustfmt-preview/bin/rustfmt'
const GOOGLE_JAVA_FORMAT_VERSION = '1.19.2'
const GOOGLE_JAVA_FORMAT_JAR = path.join(
  __dirname,
  'tools',
  `google-java-format-${GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar`,
)
const GOOGLE_JAVA_FORMAT_URL = `https://repo1.maven.org/maven2/com/google/googlejavaformat/google-java-format/${GOOGLE_JAVA_FORMAT_VERSION}/google-java-format-${GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar`

function commandSucceeds(command, args) {
  try {
    execFileSync(command, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { stdio: 'inherit' })
}

function setupPython() {
  console.log('\n== Python: black ==')
  if (commandSucceeds('python', ['-m', 'black', '--version'])) {
    console.log('black is already installed.')
    return
  }
  run('python', ['-m', 'pip', 'install', 'black'])
}

function setupGo() {
  console.log('\n== Go: gofmt ==')
  if (commandSucceeds('docker', ['exec', 'piston_api', 'test', '-x', GOFMT_BIN])) {
    console.log('gofmt found in piston_api (ships with the Go piston package).')
  } else {
    console.warn(
      `WARNING: gofmt not found at ${GOFMT_BIN} in piston_api. Is the go 1.16.2 piston package installed?`,
    )
  }
}

function setupRust() {
  console.log('\n== Rust: rustfmt ==')
  if (commandSucceeds('docker', ['exec', 'piston_api', 'test', '-x', RUSTFMT_BIN])) {
    console.log('rustfmt found in piston_api (ships with the Rust piston package).')
  } else {
    console.warn(
      `WARNING: rustfmt not found at ${RUSTFMT_BIN} in piston_api. Is the rust 1.68.2 piston package installed?`,
    )
  }
}

function setupCpp() {
  console.log('\n== C++: clang-format ==')
  if (commandSucceeds('docker', ['exec', 'piston_api', 'which', 'clang-format'])) {
    console.log('clang-format is already installed in piston_api.')
    return
  }
  console.log(
    'clang-format missing in piston_api. Debian buster is EOL, so pointing apt at archive.debian.org first.',
  )
  const script = [
    'printf "deb http://archive.debian.org/debian buster main\\ndeb http://archive.debian.org/debian-security buster/updates main\\n" > /etc/apt/sources.list',
    'apt-get update',
    'apt-get install -y clang-format',
  ].join(' && ')
  run('docker', ['exec', 'piston_api', 'bash', '-c', script])
}

function setupJava() {
  console.log('\n== Java: google-java-format ==')
  if (fs.existsSync(GOOGLE_JAVA_FORMAT_JAR)) {
    console.log(`${path.basename(GOOGLE_JAVA_FORMAT_JAR)} is already present.`)
    return
  }
  fs.mkdirSync(path.dirname(GOOGLE_JAVA_FORMAT_JAR), { recursive: true })
  run('curl', ['-sL', '-o', GOOGLE_JAVA_FORMAT_JAR, GOOGLE_JAVA_FORMAT_URL])
}

setupPython()
setupGo()
setupRust()
setupCpp()
setupJava()

console.log('\nDone.')
