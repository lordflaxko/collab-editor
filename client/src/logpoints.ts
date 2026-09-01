// Piston has no debug protocol -- it just streams stdout/stderr for a
// fire-and-forget process, so real pause/step/inspect isn't possible without
// replacing the sandbox entirely. Instead, a breakpoint here becomes a
// logpoint: before Run sends the code off, this splices in a print statement
// right after the breakpoint's line that reports the watch expressions, and
// the output gets scanned back for it afterwards. This works identically for
// every language already in the app, using nothing but each language's own
// built-in print facility.
export interface ResolvedBreakpoint {
  id: string
  lineNumber: number // 1-indexed
  expressions: string[]
}

// A single control character (SOH, ) marks the injected lines --
// essentially never appears in normal program output, and (unlike a
// printable prefix such as "[[BP]]") the literal byte is valid inside a
// plain string literal in every target language's source syntax without
// needing a per-language escape sequence of its own. Always referenced via
// this escape (never typed as a literal byte in this file), so it can't be
// mangled by an editor or a text-based diff/copy along the way.
const MARK = ''

// The part of the marker before the breakpoint id -- stable regardless of
// which breakpoint produced it, so a consumer streaming partial output can
// tell "this line might turn out to be a marker line" from "this definitely
// isn't one" before the line has even finished arriving.
export const MARKER_START = `${MARK}BP${MARK}`

function markerFor(id: string) {
  return `${MARKER_START}${id}${MARK}`
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildLogStatement(languageId: string, breakpointId: string, expressions: string[]): string | null {
  const marker = markerFor(breakpointId)
  switch (languageId) {
    case 'javascript':
    case 'typescript': {
      const args = expressions.flatMap((e) => [`"${esc(e)}"`, '"="', `(${e})`])
      return `console.log("${marker}"${args.length ? ', ' + args.join(', ') : ''});`
    }
    case 'python': {
      const args = expressions.flatMap((e) => [`"${esc(e)}"`, '"="', `(${e})`])
      return `print("${marker}"${args.length ? ', ' + args.join(', ') : ''})`
    }
    case 'java': {
      const concat = expressions.map((e) => ` + " ${esc(e)} = " + (${e})`).join('')
      return `System.out.println("${marker}"${concat});`
    }
    case 'cpp': {
      const stream = expressions.map((e) => ` << " ${esc(e)} = " << (${e})`).join('')
      return `std::cout << "${marker}"${stream} << std::endl;`
    }
    case 'rust': {
      const fmt = expressions.map((e) => ` ${esc(e)} = {:?}`).join('')
      const args = expressions.map((e) => `(${e})`).join(', ')
      return `println!("${marker}${fmt}"${args ? ', ' + args : ''});`
    }
    case 'go': {
      const args = expressions.flatMap((e) => [`"${esc(e)}"`, '"="', `(${e})`])
      return `fmt.Println("${marker}"${args.length ? ', ' + args.join(', ') : ''})`
    }
    default:
      return null
  }
}

// Insertions apply bottom-to-top so an earlier one doesn't shift the line
// numbers a later one still needs to target.
export function injectLogpoints(
  code: string,
  breakpoints: ResolvedBreakpoint[],
  languageId: string,
): string {
  if (breakpoints.length === 0) return code
  const lines = code.split('\n')
  const sorted = [...breakpoints].sort((a, b) => b.lineNumber - a.lineNumber)
  for (const bp of sorted) {
    const statement = buildLogStatement(languageId, bp.id, bp.expressions)
    if (!statement) continue
    lines.splice(Math.min(bp.lineNumber, lines.length), 0, statement)
  }
  return lines.join('\n')
}

const MARKER_PATTERN = new RegExp(`^\\u0001BP\\u0001([^\\u0001]+)\\u0001(.*)$`)

export function parseDebugLine(line: string): { breakpointId: string; text: string } | null {
  const match = line.match(MARKER_PATTERN)
  if (!match) return null
  return { breakpointId: match[1], text: match[2] }
}
