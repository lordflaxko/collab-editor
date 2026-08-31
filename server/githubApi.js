async function githubRequest(token, urlPath, options = {}) {
  const response = await fetch(`https://api.github.com${urlPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `GitHub API error (${response.status})`)
  }
  return data
}

function parseOwnerRepo(remoteUrl) {
  const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(\.git)?\/?$/)
  if (!match) throw new Error('Could not parse an owner/repo from that remote URL')
  return { owner: match[1], repo: match[2] }
}

async function listPullRequests(remoteUrl, token) {
  const { owner, repo } = parseOwnerRepo(remoteUrl)
  const prs = await githubRequest(token, `/repos/${owner}/${repo}/pulls?state=open`)
  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    author: pr.user?.login ?? 'unknown',
    head: pr.head?.ref,
    base: pr.base?.ref,
    state: pr.state,
  }))
}

async function createPullRequest(remoteUrl, token, { title, head, base, body }) {
  const { owner, repo } = parseOwnerRepo(remoteUrl)
  const pr = await githubRequest(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head, base, body }),
  })
  return { number: pr.number, url: pr.html_url }
}

module.exports = { listPullRequests, createPullRequest, parseOwnerRepo }
