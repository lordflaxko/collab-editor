export interface TextMatch {
  fileId: string
  fileName: string
  from: number
  line: number
  lineText: string
}

const MAX_RESULTS = 200

// Plain case-insensitive substring search over each file's raw text --
// unlike the symbol index, this needs no parsing or background
// recomputation, since a simple scan over typical file sizes is cheap
// enough to run fresh on every keystroke.
export function searchProjectText(
  files: { id: string; name: string; content: string }[],
  query: string,
): TextMatch[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const results: TextMatch[] = []

  for (const file of files) {
    const haystack = file.content.toLowerCase()
    let searchFrom = 0
    while (results.length < MAX_RESULTS) {
      const idx = haystack.indexOf(needle, searchFrom)
      if (idx === -1) break
      const lineStart = file.content.lastIndexOf('\n', idx - 1) + 1
      const lineEndIdx = file.content.indexOf('\n', idx)
      const lineEnd = lineEndIdx === -1 ? file.content.length : lineEndIdx
      results.push({
        fileId: file.id,
        fileName: file.name,
        from: idx,
        line: file.content.slice(0, idx).split('\n').length,
        lineText: file.content.slice(lineStart, lineEnd),
      })
      searchFrom = idx + needle.length
    }
    if (results.length >= MAX_RESULTS) break
  }
  return results
}
