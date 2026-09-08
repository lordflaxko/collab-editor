const crypto = require('crypto')
const { getLoadedLiveDoc } = require('./yjsDoc')

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
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

function requireApiKey() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('The AI assistant is not configured (GEMINI_API_KEY is not set on the server)')
  }
  return apiKey
}

// Shared by askAssistant (persisted room chat) and explainCode (a private,
// one-shot request) -- both just need "send this system prompt and message
// history, get the reply text back" from the same underlying API.
// `messages` uses Gemini's own role names ('user' / 'model') rather than
// Anthropic's ('user' / 'assistant') -- callers are responsible for mapping
// their own roles before calling this.
async function callGemini(apiKey, systemPrompt, messages) {
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error?.message || `AI request failed (${response.status})`)
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return parts.map((part) => part.text ?? '').join('')
}

// Lives in the project's own Y.Doc (same pattern as chat/comments/activity),
// so everyone in the room sees the same assistant thread and can build on
// each other's questions, rather than each person getting a private,
// disconnected conversation.
async function askAssistant(room, question, actor, activeFileId) {
  const apiKey = requireApiKey()
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
    .map((entry) => ({ role: entry.role === 'assistant' ? 'model' : 'user', content: entry.text }))

  let text
  try {
    text = await callGemini(apiKey, systemPrompt, history)
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

// Unlike askAssistant, this is deliberately private and ephemeral -- it
// doesn't touch the project's shared aiChat array, so asking for an
// explanation doesn't post anything into the room's persisted AI thread for
// everyone else to see. Each call is a one-shot request with no memory of
// previous ones.
async function explainCode(code, languageId) {
  const apiKey = requireApiKey()
  if (!code || !code.trim()) throw new Error('There is no code to explain')

  const systemPrompt =
    'You are a coding assistant embedded in a collaborative code editor. ' +
    'Explain the code the user gives you clearly and concisely, in a few sentences or a short list. ' +
    "Don't rewrite or suggest changes to it -- just explain what it does."

  const message = `Explain this ${languageId} code:\n\n\`\`\`${languageId}\n${truncate(code.trim())}\n\`\`\``

  return callGemini(apiKey, systemPrompt, [{ role: 'user', content: message }])
}

module.exports = { askAssistant, explainCode }
