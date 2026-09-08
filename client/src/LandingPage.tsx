interface LandingPageProps {
  onGetStarted: () => void
}

// Rendered as one <div> per line (rather than raw '\n' text nodes mixed with
// inline <span>s) so each line's tokens lay out predictably regardless of
// whitespace handling -- relying on '\n' inside a flex/inline layout caused
// lines to run together and overflow the card.
const PREVIEW_LINES: { text: string; tok?: string }[][] = [
  [{ text: '// two people, one file', tok: 'tok-comment' }],
  [
    { text: 'function ', tok: 'tok-keyword' },
    { text: 'sync', tok: 'tok-fn' },
    { text: '(' },
    { text: 'team', tok: 'tok-param' },
    { text: ') {' },
  ],
  [
    { text: '  return ', tok: 'tok-keyword' },
    { text: 'team.' },
    { text: 'map', tok: 'tok-fn' },
    { text: '(p => p.' },
    { text: 'cursor', tok: 'tok-param' },
    { text: ')' },
  ],
  [{ text: '}' }],
]

const FEATURES = [
  {
    icon: '⬤',
    title: 'Live collaboration',
    body: 'See teammates’ cursors, selections, and edits land in real time, with chat and inline comments built in.',
  },
  {
    icon: '▶',
    title: 'Run & debug instantly',
    body: 'Execute code in a real sandbox, set breakpoints, and step through a live debugger without leaving the editor.',
  },
  {
    icon: '⎇',
    title: 'Git built in',
    body: 'Commit, branch, and open reviews against a real repo — no separate tool or context switch required.',
  },
  {
    icon: '✦',
    title: 'AI assistant',
    body: 'Ask questions about the project or get an instant explanation of any selection, right where you’re working.',
  },
]

function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-glow" aria-hidden="true" />
        <div className="landing-copy">
          <span className="landing-eyebrow">Real-time collaborative coding</span>
          <h1 className="landing-title">
            Code together, <span className="landing-title-script">in real time.</span>
          </h1>
          <p className="landing-subtitle">
            One shared editor for your whole team — live cursors, chat, git, sandboxed execution,
            and an AI assistant, all in the same tab.
          </p>
          <div className="landing-cta">
            <button
              type="button"
              className="btn btn-primary landing-cta-btn"
              onClick={onGetStarted}
            >
              Get started — it's free
            </button>
            <p className="landing-cta-note">Sign in to create or manage your projects.</p>
          </div>
        </div>

        <div className="landing-preview" aria-hidden="true">
          <div className="landing-preview-header">
            <span className="landing-preview-dot" />
            <span className="landing-preview-dot" />
            <span className="landing-preview-dot" />
            <span className="landing-preview-name">main.js</span>
          </div>
          <div className="landing-preview-code">
            {PREVIEW_LINES.map((line, i) => (
              <div className="landing-preview-line" key={i}>
                {line.map((token, j) =>
                  token.tok ? (
                    <span key={j} className={token.tok}>
                      {token.text}
                    </span>
                  ) : (
                    <span key={j}>{token.text}</span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing-feature-card">
            <span className="landing-feature-icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  )
}

export default LandingPage
