const REPO_ISSUES = 'https://github.com/lordflaxko/collab-editor/issues'
const LAST_UPDATED = 'September 2026'

interface LegalPageProps {
  kind: 'privacy' | 'terms'
  onBack: () => void
}

function Privacy() {
  return (
    <>
      <h1 className="legal-title">Privacy Policy</h1>
      <p className="legal-updated">Last updated {LAST_UPDATED}</p>

      <p className="legal-lede">
        CodeMesh is an open-source side project, not a company. This page describes exactly what
        the software stores and where it sends things, written from the code itself. It is a plain
        description rather than legal advice.
      </p>

      <h2>What an account stores</h2>
      <p>
        Signing up records a username, an email address, and a hash of your password. Passwords are
        hashed with scrypt and a per-account random salt, so the plain password is never written
        down and cannot be recovered from what is stored — only checked against.
      </p>
      <p>
        Your email is used for one thing: sending a password reset link when you ask for one. There
        is no mailing list and nothing is sent to you otherwise.
      </p>

      <h2>What your projects store</h2>
      <p>
        File contents, chat messages, inline comments, and the activity log are all stored on the
        server so collaborators stay in sync and your work survives a restart. Each project also
        gets a Git repository on the server, which keeps a history of its commits.
      </p>
      <p>
        Anyone you invite to a project can see its contents, and a project you mark public can be
        opened by anyone at all, including people without an account. Deleting a project removes it
        along with its history.
      </p>

      <h2>What gets sent elsewhere</h2>
      <p>The server talks to a few outside services, and only for specific features:</p>
      <ul>
        <li>
          <strong>Google (Gemini)</strong> — the AI Assistant and the Explain button send your code
          and question to Google's API to generate an answer. If you would rather no code left the
          server, don't use those two features; nothing else sends code anywhere.
        </li>
        <li>
          <strong>Resend</strong> — receives your email address when a password reset is sent.
        </li>
        <li>
          <strong>GitHub</strong> — contacted only when you use the Remote tab to push or open a
          pull request, using a token you supply at that moment.
        </li>
      </ul>
      <p>
        Code you Run, debug, or deploy executes in a sandbox on CodeMesh's own server and is not
        sent to a third party.
      </p>

      <h2>Credentials you type in are not kept</h2>
      <p>
        Two features ask for credentials: the Database panel takes a Postgres connection string, and
        the Source Control Remote tab takes a GitHub token. Both are used for that single request
        and then discarded — neither is written to disk, which is why you have to enter them again
        each time you open the panel.
      </p>

      <h2>Logs</h2>
      <p>
        The web server keeps ordinary access logs — IP address, timestamp, the path requested, and
        your browser's user-agent string. These exist for debugging and for rate limiting, which
        uses your IP address to stop one source from flooding the service.
      </p>

      <h2>Cookies and tracking</h2>
      <p>
        There are none. No analytics, no advertising, no third-party trackers. Your session token
        and your theme preference are kept in your browser's local storage, which stays on your
        device.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Deleting a project removes it and its history from the server. There is no self-serve
        account deletion yet; if you want an account and its data removed, ask via the link below
        and it will be deleted manually.
      </p>

      <h2>This is a hobby project</h2>
      <p>
        CodeMesh runs on a single small server with no backups. Please don't store anything
        confidential or irreplaceable in it — treat it as a place to try things out rather than a
        home for work that matters.
      </p>
    </>
  )
}

function Terms() {
  return (
    <>
      <h1 className="legal-title">Terms &amp; Conditions</h1>
      <p className="legal-updated">Last updated {LAST_UPDATED}</p>

      <p className="legal-lede">
        CodeMesh is a free, open-source side project offered as-is. Using it means accepting what
        follows. This is a plain description rather than legal advice.
      </p>

      <h2>What you can expect</h2>
      <p>
        The service is free and comes with no guarantees: no uptime commitment, no support
        commitment, and no promise that your data will still be here tomorrow. It runs on a single
        small server that may be restarted, updated, or taken down without notice, and it has no
        backups. Keep your own copy of anything you care about — every project can be exported as a
        .zip from its toolbar.
      </p>

      <h2>Your content is yours</h2>
      <p>
        You keep ownership of whatever you write here. Nothing you create is claimed, sold, or used
        to train anything. The one thing to be aware of is that marking a project public makes it
        readable by anyone, and that inviting a collaborator gives that person access at whatever
        role you chose.
      </p>

      <h2>Running code</h2>
      <p>
        CodeMesh runs code you write inside a sandboxed container with limits on memory, CPU, and
        run time. That sandbox is a real boundary, but no sandbox is perfect. Don't use it to attack
        anything, to mine cryptocurrency, to host something long-running, or to get around the rate
        limits — and don't run code you wouldn't be comfortable running.
      </p>
      <p>
        Deploy previews are temporary. They are point-in-time snapshots, capped in number, and can
        be torn down at any time.
      </p>

      <h2>Fair use</h2>
      <p>
        There are rate limits on signing up, running code, and other expensive operations. They
        exist so one person can't exhaust a small shared server. Deliberately working around them,
        or using the service in a way that degrades it for others, may get an account removed.
      </p>

      <h2>Accounts</h2>
      <p>
        You're responsible for your account and for what happens under it. Use a password you don't
        use elsewhere — this is a hobby project, not a bank. Accounts that abuse the service can be
        removed without notice.
      </p>

      <h2>No warranty</h2>
      <p>
        The software is provided "as is", without warranty of any kind. The author isn't liable for
        lost work, downtime, or anything that goes wrong as a result of using it. If that's not an
        acceptable trade, the project is open source — run your own copy, where the guarantees are
        whatever you make them.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may change as the project does. The date at the top says when they were last
        revised.
      </p>
    </>
  )
}

function LegalPage({ kind, onBack }: LegalPageProps) {
  return (
    <div className="legal-page">
      <article className="legal-card">
        {kind === 'privacy' ? <Privacy /> : <Terms />}

        <div className="legal-contact">
          <h2>Questions</h2>
          <p>
            Anything about this page, your data, or the project itself is best raised as an issue on{' '}
            <a href={REPO_ISSUES} target="_blank" rel="noreferrer">
              GitHub
            </a>
            .
          </p>
        </div>

        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </article>
    </div>
  )
}

export default LegalPage
