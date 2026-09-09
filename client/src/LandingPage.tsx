import { PlayIcon } from './icons'

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
    body: 'See teammates’ cursors, selections, and edits land in real time.',
    bullets: ['Live cursors & presence', 'Inline comment threads', 'Room chat with mentions'],
  },
  {
    icon: '▶',
    title: 'Run & debug instantly',
    body: 'Execute code in a real sandbox without leaving the editor.',
    bullets: ['Interactive stdin terminal', 'Real step-through debugging', 'Set breakpoints & logpoints'],
  },
  {
    icon: '⎇',
    title: 'Git built in',
    body: 'Commit, branch, and review against a real repo.',
    bullets: ['Commit & branch history', 'Diff review before merging', 'No separate tool needed'],
  },
  {
    icon: '✦',
    title: 'AI assistant',
    body: 'Ask questions or get an explanation of any selection.',
    bullets: ['Explain any selection', 'Ask about the whole project', 'Answers stay in the room chat'],
  },
]

const TIMELINE_STEPS = [
  { label: 'Sign up', body: 'Create a free account in seconds.' },
  { label: 'Create a project', body: 'Start blank or from a template.' },
  { label: 'Invite your team', body: 'Share a link, pick their role.' },
  { label: 'Code together', body: 'Live cursors, chat, comments, presence.' },
  { label: 'Run, review, ship', body: 'Execute, debug, commit, deploy.' },
]

const FAQS = [
  {
    q: 'Is it free to use?',
    a: 'Yes. Creating an account, creating projects, and using the editor are all free.',
  },
  {
    q: 'What languages are supported?',
    a: 'JavaScript, TypeScript, Python, Java, C++, Rust, and Go — each with real execution and formatting, not just syntax highlighting.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. It runs entirely in your browser — open a project and start typing.',
  },
  {
    q: 'Is my code private?',
    a: 'Projects are private by default, visible only to people you invite. You can also mark a project public if you want anyone with the link to view it.',
  },
  {
    q: 'Can my whole team use one project?',
    a: 'Yes — invite teammates with a link, assign viewer, editor, or admin roles, and everyone edits, chats, and reviews together live.',
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

      <section className="landing-section">
        <h2 className="landing-section-title">
          How it <span className="landing-title-script">works</span>
        </h2>
        <p className="landing-section-subtitle">From an empty dashboard to shipping code, together.</p>
        <div className="landing-timeline">
          {TIMELINE_STEPS.map((step, i) => (
            <div key={step.label} className="landing-timeline-card">
              <span className="landing-timeline-index">{i + 1}</span>
              <h3>{step.label}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">
          Everything you need to <span className="landing-title-script">ship</span>
        </h2>
        <p className="landing-section-subtitle">
          Real collaboration, a real sandbox, and real git — not a toy demo.
        </p>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature-card">
              <span className="landing-feature-icon">
                {f.icon === '▶' ? <PlayIcon size={16} /> : f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <ul className="landing-feature-bullets">
                {f.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">
          See it in <span className="landing-title-script">action</span>
        </h2>
        <p className="landing-section-subtitle">A platform designed to feel like one shared room.</p>
        <div className="landing-mockups" aria-hidden="true">
          <div className="landing-mockup">
            <div className="landing-mockup-header">Presence</div>
            <div className="landing-mockup-body">
              <div className="landing-mockup-cursor">
                <span className="landing-mockup-cursor-dot" />
                Alex
              </div>
              <div className="landing-mockup-cursor landing-mockup-cursor-alt">
                <span className="landing-mockup-cursor-dot" />
                Sam
              </div>
              <div className="landing-mockup-chat">
                <span className="landing-mockup-chat-author">Sam</span>
                <span>can you check the auth flow?</span>
              </div>
            </div>
          </div>
          <div className="landing-mockup">
            <div className="landing-mockup-header">Terminal</div>
            <div className="landing-mockup-body landing-mockup-terminal">
              <div>$ npm test</div>
              <div className="tok-fn">✓ all tests passed (12ms)</div>
              <div className="tok-comment">exit code 0</div>
            </div>
          </div>
          <div className="landing-mockup">
            <div className="landing-mockup-header">My Projects</div>
            <div className="landing-mockup-body">
              <div className="landing-mockup-project">
                <span className="landing-mockup-project-name">api-gateway</span>
                <span className="landing-mockup-project-meta">private</span>
                <span className="landing-mockup-badge">editor</span>
              </div>
              <div className="landing-mockup-project">
                <span className="landing-mockup-project-name">design-system</span>
                <span className="landing-mockup-project-meta">public</span>
                <span className="landing-mockup-badge">owner</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section-title">
          Questions? We've got <span className="landing-title-script">answers</span>
        </h2>
        <div className="landing-faq">
          {FAQS.map((item) => (
            <details key={item.q} className="landing-faq-item">
              <summary>
                {item.q}
                <span className="landing-faq-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-section landing-closing">
        <h2 className="landing-section-title">
          Ready to start your next <span className="landing-title-script">project?</span>
        </h2>
        <p className="landing-section-subtitle">Free to join. Invite your team when you're ready.</p>
        <button type="button" className="btn btn-primary landing-cta-btn" onClick={onGetStarted}>
          Get started — it's free
        </button>
      </section>

      <footer className="landing-footer">
        <span className="landing-footer-brand">
          <span className="app-brand-mark">◆</span>CodeMesh
        </span>
        <span>Real-time collaborative coding.</span>
      </footer>
    </div>
  )
}

export default LandingPage
