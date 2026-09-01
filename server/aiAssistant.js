const crypto = require('crypto')
const { getLoadedLiveDoc } = require('./yjsDoc')

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
const MAX_CONTEXT_CHARS = 8000
// Bounds how much of the room's own aiChat history gets replayed back to the
// API as conversation context, so the prompt (and its cost) doesn't grow
// without limit as a project's assistant thread gets longer.
const HISTORY_MESSAGES = 20

function truncate(text) {
  return text.length > MAX_CONTEXT_CHARS
    ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n… (truncated)`
    : text
}

// Lives in the project's own Y.Doc (same pattern as chat/comments/activity),
// so everyone in the room sees the same assistant thread and can build on
// each other's questions, rather than each person getting a private,
// disconnected conversation.
async function askAssistant(room, question, actor, activeFileId) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('The AI assistant is not configured (ANTHROPIC_API_KEY is not set on the server)')
  }
  if (!question || !question.trim()) throw new Error('A question is required')

  const ydoc = await getLoadedLiveDoc(room)
  const chat = ydoc.getArray('aiChat')
  const filesMap = ydoc.getMap('files')
  const order = ydoc.getArray('fileOrder')

  const fileNames = order
    .toArray()
    .map((id) => filesMap.get(id)?.name)
    .filter(Boolean)

  let activeFileContext = ''
  const activeMeta = activeFileId ? filesMap.get(activeFileId) : null
  if (activeMeta) {
    const content = ydoc.getText(`content:${activeFileId}`).toString()
    activeFileContext = `\n\nThe file currently open is "${activeMeta.name}":\n\`\`\`\n${truncate(content)}\n\`\`\``
  }

  const systemPrompt =
    'You are a read-only coding assistant embedded in a collaborative code editor. ' +
    "You cannot edit files yourself -- only answer questions and suggest code in your reply for someone to copy in themselves. Keep answers concise.\n\n" +
    `This project's files: ${fileNames.join(', ') || '(none yet)'}.` +
    activeFileContext

  chat.push([
    { id: crypto.randomUUID(), role: 'user', author: actor, text: question.trim(), timestamp: Date.now() },
  ])

  const history = chat
    .toArray()
    .slice(-HISTORY_MESSAGES)
    .map((entry) => ({ role: entry.role === 'assistant' ? 'assistant' : 'user', content: entry.text }))

  let text
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt, messages: history }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error?.message || `AI request failed (${response.status})`)
    }
    text = (data.content ?? []).map((block) => block.text ?? '').join('')
  } catch (err) {
    chat.push([
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        author: 'Assistant',
        text: `Error: ${err.message}`,
        timestamp: Date.now(),
        error: true,
      },
    ])
    throw err
  }

  chat.push([
    { id: crypto.randomUUID(), role: 'assistant', author: 'Assistant', text, timestamp: Date.now() },
  ])
  return text
}

module.exports = { askAssistant }
