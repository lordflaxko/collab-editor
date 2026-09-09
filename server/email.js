const RESEND_API_URL = 'https://api.resend.com/emails'
// Resend's own sandbox sender -- works with zero setup (no custom domain or
// DNS verification needed), which matches where this project is at: it runs
// locally and has no domain of its own yet.
const FROM_ADDRESS = process.env.RESEND_FROM || 'CodeMesh <onboarding@resend.dev>'

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('Email is not configured (RESEND_API_KEY is not set on the server)')
  }
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Email request failed (${response.status})`)
  }
  return data
}

module.exports = { sendEmail }
