const dnsPromises = require('dns').promises
const net = require('net')

// The Database panel makes the server open an outbound connection to
// whatever host the caller typed. On a machine only the developer can reach
// that is merely a convenience; on a public instance it turns the server
// into a probe for anything it can reach that the caller cannot -- other
// containers on the Docker bridge, the host itself, and cloud metadata
// endpoints such as 169.254.169.254, which on most providers will hand out
// instance credentials to anything that asks.
//
// So: resolve the hostname first and refuse the request unless every
// address it maps to is publicly routable.

// Each entry is [first address of the range, prefix length].
const BLOCKED_V4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
]

function v4ToInt(address) {
  return address.split('.').reduce((total, octet) => total * 256 + Number(octet), 0)
}

function isBlockedV4(address) {
  const value = v4ToInt(address)
  return BLOCKED_V4.some(([range, prefix]) => {
    const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0
    return (value & mask) >>> 0 === (v4ToInt(range) & mask) >>> 0
  })
}

function isBlockedV6(address) {
  const lower = address.toLowerCase()
  // ::ffff:1.2.3.4 and ::1.2.3.4 embed a v4 address, so judge them as v4
  // rather than letting them slip past the v6 checks below.
  const embedded = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (embedded) return isBlockedV4(embedded[1])

  if (lower === '::' || lower === '::1') return true
  const head = lower.split(':')[0]
  if (!head) return false
  const leading = parseInt(head, 16)
  if (Number.isNaN(leading)) return false
  if ((leading & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((leading & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  return false
}

function isBlockedAddress(address) {
  const version = net.isIP(address)
  if (version === 4) return isBlockedV4(address)
  if (version === 6) return isBlockedV6(address)
  return true // unparseable -- refuse rather than guess
}

// Handles both URL form (postgres://user:pass@host:5432/db) and the
// key=value form that `pg` also accepts (host=... port=... dbname=...).
function extractHost(connectionString) {
  const trimmed = connectionString.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const match = /(?:^|\s)host\s*=\s*('[^']*'|"[^"]*"|\S+)/i.exec(trimmed)
    return match ? match[1].replace(/^['"]|['"]$/g, '') : null
  }
  try {
    const hostname = new URL(trimmed).hostname
    // A bracketed IPv6 literal keeps its brackets in URL.hostname.
    return hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

// Throws if the connection string points anywhere that isn't publicly
// routable. Note this validates the name's *current* resolution: a hostname
// whose DNS changes between this check and the connection could still slip
// through. Closing that fully means connecting to a pinned address, which
// `pg` gives no clean way to do -- this raises the bar substantially without
// claiming to be airtight.
async function assertPublicHost(connectionString) {
  // Pointing the panel at a database on your own machine is the normal case
  // in local development and in the end-to-end tests, and it is only
  // dangerous once the server is reachable by people you don't know. The
  // opt-out is explicit and defaults to off, so a deployment is protected
  // unless someone deliberately turns the guard off.
  if (process.env.ALLOW_PRIVATE_DB_HOSTS === '1') return

  const host = extractHost(connectionString)
  if (!host) {
    throw new Error('Could not read a host out of that connection string')
  }

  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new Error(`Refusing to connect to ${host}: not a publicly routable address`)
    }
    return
  }

  let resolved
  try {
    resolved = await dnsPromises.lookup(host, { all: true })
  } catch {
    throw new Error(`Could not resolve host: ${host}`)
  }

  const blocked = resolved.find((entry) => isBlockedAddress(entry.address))
  if (blocked) {
    throw new Error(
      `Refusing to connect to ${host}: it resolves to ${blocked.address}, which is not publicly routable`,
    )
  }
}

module.exports = { assertPublicHost, extractHost, isBlockedAddress }
