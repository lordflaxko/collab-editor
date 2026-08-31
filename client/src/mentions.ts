export const MENTION_PATTERN = /@([a-zA-Z0-9_-]{3,20})/g

export function extractMentions(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(MENTION_PATTERN)) {
    names.add(match[1])
  }
  return Array.from(names)
}

export interface TextSegment {
  text: string
  isMention: boolean
}

export function splitMentions(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), isMention: false })
    }
    segments.push({ text: match[0], isMention: true })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMention: false })
  }
  return segments
}
