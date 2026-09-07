import { test, expect, type Page } from '@playwright/test'

// The Run/Format tests exercise the sync server's /run and /format proxies,
// which in turn need the self-hosted Piston container (docker run ... piston)
// and Python+Black to be available. Everything else only needs the two dev
// servers Playwright already starts.

function uniqueUsername(label: string) {
  return `${label}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 20)
}

async function signUp(page: Page, username: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Sign up instead' }).click()
  await page.getByLabel('Account username').fill(username)
  await page.getByLabel('Account password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
}

async function logIn(page: Page, username: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel('Account username').fill(username)
  await page.getByLabel('Account password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
}

async function createProject(
  page: Page,
  name: string,
  visibility: 'public' | 'private' = 'private',
  templateId?: string,
) {
  await page.getByPlaceholder('Project name').fill(name)
  await page.locator('.visibility-select').selectOption(visibility)
  if (templateId) await page.locator('.template-select').selectOption(templateId)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await page.waitForSelector('.cm-content')
}

// Signs up a fresh owner and creates a fresh project in one step -- the most
// common setup below, replacing the old passphrase-era openRoom() helper.
async function openNewProject(
  page: Page,
  label: string,
  visibility: 'public' | 'private' = 'private',
  templateId?: string,
) {
  const username = uniqueUsername(label)
  await signUp(page, username)
  await createProject(page, `Project ${label}`, visibility, templateId)
  return username
}

async function typeCode(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.type(text)
}

// From the owner's already-open project page, generates an invite link for
// the given role, then has a second (not-yet-signed-in) page sign up and
// redeem it. Returns the new member's username.
async function inviteAndJoin(
  ownerPage: Page,
  otherPage: Page,
  otherLabel: string,
  role: 'editor' | 'admin' | 'viewer' = 'editor',
) {
  await ownerPage.getByRole('button', { name: 'Members' }).click()
  await ownerPage.locator('.invite-section select').selectOption(role)
  await ownerPage.getByRole('button', { name: 'Generate invite link' }).click()
  await expect(ownerPage.locator('.invite-section .text-input')).toHaveValue(/join\//, { timeout: 10000 })
  const link = await ownerPage.locator('.invite-section .text-input').inputValue()
  await ownerPage.getByRole('button', { name: 'Close' }).click()

  const username = uniqueUsername(otherLabel)
  await signUp(otherPage, username)
  await otherPage.goto(new URL(link).pathname)
  await expect(otherPage.getByText('Connected', { exact: true })).toBeVisible()
  await otherPage.waitForSelector('.cm-content')
  return username
}

test('a logged-out visitor sees a sign-in prompt at the dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Sign in above to create or manage your projects.')).toBeVisible()
})

test('a project appears in the dashboard list and can be reopened from there', async ({ page }) => {
  await signUp(page, uniqueUsername('dashlist'))
  await createProject(page, 'Listed Project', 'private')
  const projectUrl = page.url()

  await page.getByRole('button', { name: 'Dashboard' }).first().click()
  await expect(page.getByText('Listed Project')).toBeVisible()
  await page.getByText('Listed Project').click()
  await expect(page).toHaveURL(projectUrl)
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
})

test('two clients in the same project sync typed code', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'sync')
  await inviteAndJoin(pageA, pageB, 'syncb', 'editor')

  await typeCode(pageA, 'const hello = "from A"')
  await expect(pageB.locator('.cm-content')).toContainText('from A')

  await contextA.close()
  await contextB.close()
})

test('two different projects do not share content', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'alpha')
  await typeCode(pageA, 'const alphaOnly = true')

  await openNewProject(pageB, 'beta')
  await pageB.waitForTimeout(500)
  await expect(pageB.locator('.cm-content')).not.toContainText('alphaOnly')

  await contextA.close()
  await contextB.close()
})

test('reopening the same project restores its content', async ({ browser }) => {
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  const username = await openNewProject(page1, 'persist')
  await typeCode(page1, 'const saved = "content"')
  await page1.waitForTimeout(500) // let the update flush to the server
  const projectUrl = page1.url()
  await context1.close()

  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await logIn(page2, username)
  await page2.goto(new URL(projectUrl).pathname)
  await expect(page2.getByText('Connected', { exact: true })).toBeVisible()
  await expect(page2.locator('.cm-content')).toContainText('saved')
  await context2.close()
})

test('a private project cannot be opened by a non-member, but an invited editor can open it', async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'secure', 'private')
  await typeCode(ownerPage, 'const secret = "content"')
  await ownerPage.waitForTimeout(500)
  const projectUrl = ownerPage.url()

  const strangerCtx = await browser.newContext()
  const strangerPage = await strangerCtx.newPage()
  await signUp(strangerPage, uniqueUsername('stranger'))
  await strangerPage.goto(new URL(projectUrl).pathname)
  await expect(strangerPage.getByText('You do not have access to this project')).toBeVisible()

  const editorCtx = await browser.newContext()
  const editorPage = await editorCtx.newPage()
  await inviteAndJoin(ownerPage, editorPage, 'secureeditor', 'editor')
  await expect(editorPage.locator('.cm-content')).toContainText('secret')

  await ownerCtx.close()
  await strangerCtx.close()
  await editorCtx.close()
})

test('a public project can be viewed by an anonymous visitor without logging in', async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'publicproj', 'public')
  await typeCode(ownerPage, 'console.log("public content")')
  await ownerPage.waitForTimeout(500)
  const projectUrl = ownerPage.url()

  const anonCtx = await browser.newContext()
  const anonPage = await anonCtx.newPage()
  await anonPage.goto(new URL(projectUrl).pathname)
  await expect(anonPage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(anonPage.locator('.role-badge')).toContainText('viewer')
  await expect(anonPage.locator('.cm-content')).toContainText('public content')

  await ownerCtx.close()
  await anonCtx.close()
})

test('a viewer has no edit controls and the server rejects any edit they attempt', async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'viewersec', 'private')
  await typeCode(ownerPage, 'console.log("owner content")')
  await ownerPage.waitForTimeout(500)

  const viewerCtx = await browser.newContext()
  const viewerPage = await viewerCtx.newPage()
  await inviteAndJoin(ownerPage, viewerPage, 'viewersecviewer', 'viewer')

  await expect(viewerPage.locator('.role-badge')).toContainText('viewer')
  await expect(viewerPage.locator('.file-tree-header button', { hasText: '+ New' })).toHaveCount(0)
  await expect(viewerPage.locator('.editor-actions button', { hasText: 'Format' })).toHaveCount(0)

  // The viewer's browser will locally show the keystroke, but it's a purely
  // local Yjs transaction the server never accepts -- reloading proves it
  // was rejected at the protocol level, not just hidden by disabled UI.
  await viewerPage.locator('.cm-content').click()
  await viewerPage.keyboard.type('SHOULD NOT PERSIST')
  await viewerPage.waitForTimeout(500)
  await viewerPage.reload()
  await expect(viewerPage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(viewerPage.locator('.cm-content')).not.toContainText('SHOULD NOT PERSIST')
  await expect(viewerPage.locator('.cm-content')).toContainText('owner content')

  await ownerCtx.close()
  await viewerCtx.close()
})

test("an admin can change a member's role and remove them", async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'roleadmin', 'private')

  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  const memberUsername = await inviteAndJoin(ownerPage, memberPage, 'roleadminmember', 'viewer')

  await ownerPage.getByRole('button', { name: 'Members' }).click()
  const memberRow = ownerPage.locator('.member-item', { hasText: memberUsername })
  await memberRow.locator('select').selectOption('editor')
  await expect(memberRow.locator('select')).toHaveValue('editor')

  // The member's own view picks up the promotion on their next connection.
  await memberPage.reload()
  await expect(memberPage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(memberPage.locator('.role-badge')).toContainText('editor')

  // The Members panel is still open from above -- clicking the toggle again
  // would close it, not reopen it.
  ownerPage.once('dialog', (dialog) => dialog.accept())
  await ownerPage
    .locator('.member-item', { hasText: memberUsername })
    .getByRole('button', { name: 'Remove' })
    .click()
  await expect(ownerPage.locator('.member-item', { hasText: memberUsername })).toHaveCount(0)

  await ownerCtx.close()
  await memberCtx.close()
})

test('the owner can delete a project', async ({ page }) => {
  await openNewProject(page, 'deleteme', 'private')
  await page.getByRole('button', { name: 'Members' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByText('No projects yet')).toBeVisible({ timeout: 10000 })
})

test("setting your name shows up in another client's presence list", async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'presence', 'public')
  const projectUrl = ownerPage.url()

  const anonCtx = await browser.newContext()
  const anonPage = await anonCtx.newPage()
  await anonPage.goto(new URL(projectUrl).pathname)
  await anonPage.getByLabel('Your name').fill('Alice')
  await expect(anonPage.getByText('Connected', { exact: true })).toBeVisible()

  await expect(ownerPage.locator('.presence-chip', { hasText: 'Alice' })).toBeVisible()

  await ownerCtx.close()
  await anonCtx.close()
})

test("a remote client sees the other user's live cursor and selection highlight", async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'cursorowner', 'private')

  const editorCtx = await browser.newContext()
  const editorPage = await editorCtx.newPage()
  const editorUsername = await inviteAndJoin(ownerPage, editorPage, 'cursor', 'editor')

  await typeCode(editorPage, 'const hello = "world"')
  await editorPage.keyboard.press('Shift+Home')

  await expect(ownerPage.locator('.cm-ySelectionInfo', { hasText: editorUsername })).toBeAttached({
    timeout: 10000,
  })
  await expect(ownerPage.locator('.cm-ySelection').first()).toBeAttached()

  await ownerCtx.close()
  await editorCtx.close()
})

test('a join/leave notification appears when a peer connects or disconnects', async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'joinleaveowner', 'private')

  const bobCtx = await browser.newContext()
  const bobPage = await bobCtx.newPage()
  const bobUsername = await inviteAndJoin(ownerPage, bobPage, 'joinleavebob', 'editor')

  await expect(ownerPage.locator('.toast', { hasText: `${bobUsername} joined` })).toBeVisible()

  await bobCtx.close()
  await expect(ownerPage.locator('.toast', { hasText: `${bobUsername} left` })).toBeVisible({ timeout: 10000 })

  await ownerCtx.close()
})

test('creating a file adds it to the tree, and each file keeps separate content', async ({ page }) => {
  await openNewProject(page, 'files')

  // The project starts with a default file.
  await expect(page.locator('.file-tree-item')).toHaveCount(1)
  await typeCode(page, 'const inMain = true')

  await page.getByRole('button', { name: '+ New' }).click()
  await page.getByPlaceholder('filename.ext').fill('helper.py')
  await page.keyboard.press('Enter')

  await expect(page.locator('.file-tree-item')).toHaveCount(2)
  await expect(page.locator('.language-picker')).toHaveValue('python')
  await expect(page.locator('.cm-content')).not.toContainText('inMain')

  await typeCode(page, 'def helper():\n    pass')

  await page.locator('.file-tree-item', { hasText: 'main.js' }).click()
  await expect(page.locator('.cm-content')).toContainText('inMain')
  await expect(page.locator('.cm-content')).not.toContainText('helper')
})

test('creating a project from the JavaScript template seeds a runnable file and a passing test', async ({
  page,
}) => {
  await openNewProject(page, 'template', 'private', 'javascript')

  await expect(page.locator('.file-tree-item')).toHaveCount(2)
  await expect(page.locator('.file-tree-item', { hasText: 'main.js' })).toBeVisible()
  await expect(page.locator('.file-tree-item', { hasText: 'main.test.js' })).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('fizzbuzz')

  await page.getByRole('button', { name: /^▶ Run/ }).click()
  await expect(page.locator('.run-output-stdout')).toContainText('FizzBuzz', { timeout: 20000 })

  await page.getByRole('button', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Run Tests' }).click()
  await expect(page.locator('.test-item-pass')).toHaveCount(4, { timeout: 15000 })
  await expect(page.locator('.test-item-fail')).toHaveCount(0)
})

test('saving a project as a custom template makes it available and deletable from the dashboard', async ({
  page,
}) => {
  const username = await openNewProject(page, 'customtpl')

  await typeCode(page, 'console.log("from custom template")')
  await page.getByRole('button', { name: '+ New' }).click()
  await page.getByPlaceholder('filename.ext').fill('helper.py')
  await page.keyboard.press('Enter')

  const templateName = `My Template ${Date.now()}`
  await page.getByRole('button', { name: 'Save as Template' }).click()
  await page.locator('.save-template-popover input').fill(templateName)
  await page.locator('.save-template-popover button', { hasText: 'Save' }).click()
  await expect(page.locator('.save-template-popover')).toContainText('Saved')
  await page.locator('.save-template-popover button', { hasText: 'Close' }).click()

  await page.getByRole('button', { name: 'Dashboard' }).first().click()
  const templateItem = page.locator('.template-list-item', { hasText: templateName })
  await expect(templateItem).toContainText(`by ${username}`)
  await expect(templateItem).toContainText('2 files')
  await expect(templateItem.getByRole('button', { name: 'Delete' })).toBeVisible()

  await page.getByPlaceholder('Project name').fill('Project fromtemplate')
  await page.locator('.template-select').selectOption({ label: `${templateName} (by ${username})` })
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await page.waitForSelector('.cm-content')

  await expect(page.locator('.file-tree-item')).toHaveCount(2)
  await expect(page.locator('.file-tree-item', { hasText: 'helper.py' })).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('from custom template')

  await page.getByRole('button', { name: 'Dashboard' }).first().click()
  await expect(templateItem.getByRole('button', { name: 'Delete' })).toBeVisible()
  await templateItem.getByRole('button', { name: 'Delete' }).click()
  await expect(templateItem).toHaveCount(0)
})

test("the language picker overrides a file's language independent of its extension", async ({ page }) => {
  await openNewProject(page, 'langpicker')

  await expect(page.locator('.language-picker')).toHaveValue('javascript')
  await page.locator('.language-picker').selectOption('python')
  await expect(page.locator('.language-picker')).toHaveValue('python')
  await expect(page.locator('.file-tree-item')).toHaveText(/main\.js/)
})

test('the theme toggle cycles Auto -> Light -> Dark and forces the color scheme', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /Theme:/ })
  await expect(toggle).toHaveText('Theme: Auto')
  await expect(page.locator(':root')).not.toHaveAttribute('data-theme')

  await toggle.click()
  await expect(toggle).toHaveText('Theme: Light')
  await expect(page.locator(':root')).toHaveAttribute('data-theme', 'light')

  await toggle.click()
  await expect(toggle).toHaveText('Theme: Dark')
  await expect(page.locator(':root')).toHaveAttribute('data-theme', 'dark')

  await toggle.click()
  await expect(toggle).toHaveText('Theme: Auto')
  await expect(page.locator(':root')).not.toHaveAttribute('data-theme')
})

test('a syntax error is flagged in the gutter and clears once fixed', async ({ page }) => {
  await openNewProject(page, 'syntax')

  await typeCode(page, 'const x = ;')
  await expect(page.locator('.cm-gutter-lint .cm-lint-marker-error')).toBeVisible()

  await page.keyboard.press('Control+A')
  await page.keyboard.type('const x = 1;')
  await expect(page.locator('.cm-gutter-lint .cm-lint-marker-error')).toHaveCount(0)
})

test('the Format button formats JavaScript via Prettier', async ({ page }) => {
  await openNewProject(page, 'format')

  await typeCode(page, 'function add(a,b){return a+b}')
  await page.getByRole('button', { name: 'Format' }).click()

  await expect(page.locator('.cm-content')).toContainText('function add(a, b) {')
})

const serverFormatCases: Array<{ language: string; unformatted: string; expected: string }> = [
  { language: 'go', unformatted: 'package main\nfunc main(){println("hi")}', expected: 'func main() { println("hi") }' },
  { language: 'rust', unformatted: 'fn main(){println!("hi");}', expected: 'fn main() {' },
  { language: 'cpp', unformatted: 'int main(){int x=1;return x;}', expected: 'int x = 1;' },
  {
    language: 'java',
    unformatted: 'public class Foo{public static void main(String[] a){int x=1;}}',
    expected: 'public static void main(String[] a) {',
  },
]

for (const { language, unformatted, expected } of serverFormatCases) {
  test(`the Format button formats ${language} via its server-side formatter`, async ({ page }) => {
    await openNewProject(page, `format-${language}`)

    await page.locator('.language-picker').selectOption(language)
    await typeCode(page, unformatted)
    await page.getByRole('button', { name: 'Format' }).click()

    await expect(page.locator('.cm-content')).toContainText(expected, { timeout: 15000 })
  })
}

test('the Run button executes code against the sandbox and shows stdout', async ({ page }) => {
  await openNewProject(page, 'run')

  await typeCode(page, 'console.log(2 + 2)')
  await page.getByRole('button', { name: /^▶ Run/ }).click()

  await expect(page.locator('.run-output-stdout')).toContainText('4', { timeout: 20000 })
  await expect(page.locator('.run-output-exit')).toContainText('Exit code: 0')
  await expect(page.locator('.run-output-exit')).toContainText('ms')
})

test('stdin can be sent interactively while a program is waiting for it', async ({ page }) => {
  await openNewProject(page, 'interactive')

  await page.locator('.language-picker').selectOption('python')
  await typeCode(page, 'name = input("name? ")\nprint("hello " + name)')

  await page.getByRole('button', { name: '▶ Run' }).click()
  await expect(page.locator('.run-output')).toContainText('name?', { timeout: 15000 })

  await page.locator('.run-stdin').fill('Playwright')
  await page.locator('.run-stdin').press('Enter')

  await expect(page.locator('.run-output')).toContainText('hello Playwright', { timeout: 10000 })
  await expect(page.locator('.run-output-exit')).toContainText('Exit code: 0')
})

test('Stop halts an in-flight run and the Run button works again afterward', async ({ page }) => {
  await openNewProject(page, 'stoprun')

  await page.locator('.language-picker').selectOption('python')
  await typeCode(page, 'import time\nwhile True:\n    print("looping", flush=True)\n    time.sleep(0.2)')

  await page.getByRole('button', { name: '▶ Run' }).click()
  await expect(page.locator('.run-output')).toContainText('looping', { timeout: 15000 })

  await page.getByRole('button', { name: '■ Stop' }).click()
  await expect(page.locator('.run-output-exit')).toContainText('Stopped')

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('print("restarted")')
  await page.getByRole('button', { name: /^▶ Run/ }).click()
  await expect(page.locator('.run-output')).toContainText('restarted', { timeout: 15000 })
})

test('a chat message and its reply sync to another client', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'chat')
  await inviteAndJoin(pageA, pageB, 'chatb', 'editor')

  await pageA.getByRole('button', { name: 'Chat' }).click()
  await pageA.locator('.chat-compose .text-input').fill('hello from A')
  await pageA.locator('.chat-compose button', { hasText: 'Send' }).click()

  await pageB.getByRole('button', { name: 'Chat' }).click()
  await expect(pageB.locator('.chat-message')).toContainText('hello from A')

  await pageB.getByRole('button', { name: 'Reply' }).click()
  await pageB.locator('.chat-thread .text-input').fill('hello from B')
  await pageB.locator('.chat-thread button', { hasText: 'Reply' }).click()

  await pageA.getByRole('button', { name: /repl(y|ies)/i }).click()
  await expect(pageA.locator('.chat-thread')).toContainText('hello from B')

  await contextA.close()
  await contextB.close()
})

test('an inline code comment thread syncs, replies, and resolves across clients', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'comment')
  await inviteAndJoin(pageA, pageB, 'commentb', 'editor')

  await typeCode(pageA, 'const total = a + b')
  await expect(pageB.locator('.cm-content')).toContainText('total')

  await pageA.locator('.cm-content').click()
  await pageA.keyboard.press('Home')
  await pageA.keyboard.press('Shift+End')
  await pageA.getByRole('button', { name: 'Comment', exact: true }).click()
  await pageA.locator('.comment-textarea').fill('is this the right formula?')
  await pageA.locator('.comment-popover-actions button', { hasText: 'Comment' }).click()

  await expect(pageB.locator('.cm-comment-marker')).toBeVisible({ timeout: 10000 })

  await pageB.locator('.cm-comment-marker').click()
  await expect(pageB.locator('.comment-popover')).toContainText('is this the right formula?')
  await pageB
    .locator('.comment-popover .comment-reply-form .text-input')
    .fill('yes, matches the spec')
  await pageB.locator('.comment-popover .comment-reply-form button', { hasText: 'Reply' }).click()

  await pageA.locator('.cm-comment-marker').click()
  await expect(pageA.locator('.comment-popover')).toContainText('yes, matches the spec')

  await pageA.getByRole('button', { name: 'Resolve' }).click()
  await expect(pageA.locator('.cm-comment-marker')).toHaveCount(0)
  await expect(pageB.locator('.cm-comment-marker')).toHaveCount(0, { timeout: 10000 })

  await contextA.close()
  await contextB.close()
})

test('pressing Escape closes an open popover', async ({ page }) => {
  await openNewProject(page, 'escape')

  await page.locator('.cm-content').click()
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(page.locator('.comment-popover')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.comment-popover')).toHaveCount(0)
})

test('mentioning a present participant autocompletes and renders highlighted', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'mentionowner')
  const bobUsername = await inviteAndJoin(pageA, pageB, 'mentionbob', 'editor')
  await expect(pageA.locator('.presence-chip', { hasText: bobUsername })).toBeVisible()

  await pageA.getByRole('button', { name: 'Chat' }).click()
  const prefix = bobUsername.slice(0, 4)
  await pageA.locator('.chat-compose .text-input').pressSequentially(`hi @${prefix}`)
  await expect(pageA.locator('.mention-suggestions')).toContainText(`@${bobUsername}`)
  await pageA.locator('.mention-suggestions button', { hasText: `@${bobUsername}` }).click()
  await pageA.locator('.chat-compose .text-input').pressSequentially('welcome')
  await pageA.locator('.chat-compose button', { hasText: 'Send' }).click()

  await expect(pageA.locator('.chat-message .mention')).toHaveText(`@${bobUsername}`)

  await contextA.close()
  await contextB.close()
})

test('an emoji reaction toggled by one client is visible to another', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'reaction')
  await inviteAndJoin(pageA, pageB, 'reactionb', 'editor')

  await pageA.getByRole('button', { name: 'Chat' }).click()
  await pageA.locator('.chat-compose .text-input').fill('react to this')
  await pageA.locator('.chat-compose button', { hasText: 'Send' }).click()

  await pageB.getByRole('button', { name: 'Chat' }).click()
  await expect(pageB.locator('.chat-message')).toContainText('react to this')
  await pageB.locator('.reaction-add-btn').click()
  await pageB.locator('.reaction-picker-popover input[type="text"]').fill('grinning face')
  await pageB.locator('.reaction-picker-popover ul button').first().click()

  await expect(pageA.locator('.reaction-pill')).toBeVisible({ timeout: 10000 })

  await pageB.locator('.reaction-pill').click()
  await expect(pageA.locator('.reaction-pill')).toHaveCount(0, { timeout: 10000 })

  await contextA.close()
  await contextB.close()
})

test('mentioning a registered account delivers a notification they see after signing in', async ({
  browser,
}) => {
  const targetUsername = uniqueUsername('target')
  const contextTarget = await browser.newContext()
  const pageTarget = await contextTarget.newPage()
  await signUp(pageTarget, targetUsername)
  await pageTarget.getByRole('button', { name: 'Log out' }).click()

  const contextSender = await browser.newContext()
  const pageSender = await contextSender.newPage()
  await openNewProject(pageSender, 'notifysender')
  await pageSender.getByRole('button', { name: 'Chat' }).click()
  await pageSender.locator('.chat-compose .text-input').fill(`hey @${targetUsername} look at this`)
  await pageSender.locator('.chat-compose button', { hasText: 'Send' }).click()

  await logIn(pageTarget, targetUsername)
  const bell = pageTarget.locator('.notification-bell button')
  await expect(bell).toContainText('1', { timeout: 20000 })
  await bell.click()
  await expect(pageTarget.locator('.notification-item')).toContainText('look at this')

  await contextTarget.close()
  await contextSender.close()
})

test('signing up creates an account and shows the signed-in state', async ({ page }) => {
  const username = uniqueUsername('signup')
  await page.goto('/')

  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Sign up instead' }).click()
  await page.getByLabel('Account username').fill(username)
  await page.getByLabel('Account password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Sign up' }).click()

  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
  await expect(page.getByLabel('Your name')).toBeDisabled()
  await expect(page.getByLabel('Your name')).toHaveValue(username)
})

test('a wrong password is rejected and a correct one logs back in after logout', async ({ page }) => {
  const username = uniqueUsername('login')
  await page.goto('/')

  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Sign up instead' }).click()
  await page.getByLabel('Account username').fill(username)
  await page.getByLabel('Account password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()

  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByLabel('Account username').fill(username)
  await page.getByLabel('Account password').fill('wrong-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Incorrect username or password')).toBeVisible()

  await page.getByLabel('Account password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
})

test('a signed-in session survives a page reload', async ({ page }) => {
  const username = uniqueUsername('persistacct')
  await signUp(page, username)
  await page.reload()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
})

test("a signed-in account's username is used as the collaborator identity", async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  const username = await openNewProject(ownerPage, 'collabid', 'private')

  const viewerCtx = await browser.newContext()
  const viewerPage = await viewerCtx.newPage()
  await inviteAndJoin(ownerPage, viewerPage, 'collabidviewer', 'viewer')

  await expect(viewerPage.locator('.presence-chip', { hasText: username })).toBeVisible()

  await ownerCtx.close()
  await viewerCtx.close()
})

test('the Source Control panel shows an untracked file and its diff', async ({ page }) => {
  await openNewProject(page, 'sourcecontrol')

  await typeCode(page, 'console.log("first version")')
  await page.waitForTimeout(500) // let the edit flush before the server syncs to disk

  await page.getByRole('button', { name: 'Source Control' }).click()
  await expect(page.locator('.source-control-panel')).toBeVisible()
  await expect(page.locator('.sc-file-item')).toContainText('main.js')
  await expect(page.locator('.sc-file-kind-untracked')).toBeVisible()

  await page.locator('.sc-file-item').click()
  await expect(page.locator('.sc-diff')).toContainText('first version')

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.locator('.sc-empty')).toContainText('No commits yet')
})

test('the Remote tab does not show a stray loading indicator left over from another tab', async ({
  page,
}) => {
  await openNewProject(page, 'remoteload')

  await page.getByRole('button', { name: 'Source Control' }).click()
  await page.getByRole('button', { name: 'Remote' }).click()
  await expect(page.locator('.sc-loading')).toHaveCount(0)
  await expect(page.getByPlaceholder('https://github.com/owner/repo.git')).toBeVisible()
})

test('a stale Format error clears once the code changes, instead of describing code that no longer exists', async ({
  page,
}) => {
  await openNewProject(page, 'formatstale')

  await typeCode(page, 'function broken( {')
  await page.getByRole('button', { name: 'Format' }).click()
  await expect(page.locator('.format-error')).toBeVisible()

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('console.log(1)')
  await expect(page.locator('.format-error')).toHaveCount(0)
})

test("the Run button's background stays solid while hovered, instead of fading to the generic hover tint", async ({
  page,
}) => {
  await openNewProject(page, 'runhover')

  const runButton = page.getByRole('button', { name: /^▶ Run/ })
  await runButton.hover()
  const color = await runButton.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(color).toBe('rgb(170, 59, 255)')
})

test('committing clears the changes list and records history', async ({ page }) => {
  await openNewProject(page, 'sccommit')

  await typeCode(page, 'console.log("v1")')
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: 'Source Control' }).click()
  await expect(page.locator('.sc-file-item')).toContainText('main.js')

  await page.locator('.sc-commit-box .text-input').fill('initial commit')
  await page.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(page.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.locator('.sc-commit-item')).toContainText('initial commit')
})

test('creating a branch, committing on it, and switching back updates the live content for everyone', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'scbranch')
  await inviteAndJoin(pageA, pageB, 'scbranchb', 'editor')

  await typeCode(pageA, 'console.log("v1 on master")')
  await pageA.waitForTimeout(500)

  await pageA.getByRole('button', { name: 'Source Control' }).click()
  await pageA.locator('.sc-commit-box .text-input').fill('v1')
  await pageA.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })

  await pageA.locator('.sc-branch-input').fill('feature-a')
  await pageA.locator('.sc-branch-bar button', { hasText: 'Create' }).click()
  await expect(pageA.locator('.sc-branch-select')).toHaveValue('feature-a', { timeout: 10000 })

  await pageA.locator('.cm-content').click()
  await pageA.keyboard.press('Control+A')
  await pageA.keyboard.type('console.log("v2 on feature-a")')
  await pageA.waitForTimeout(500)
  await pageA.locator('.sc-commit-box .text-input').fill('v2')
  await pageA.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })

  // B (never having touched Source Control) should see feature-a's content
  // live, since a project is one shared document -- no per-user branch view.
  await expect(pageB.locator('.cm-content')).toContainText('v2 on feature-a', { timeout: 10000 })

  pageA.once('dialog', (dialog) => dialog.accept())
  await pageA.locator('.sc-branch-select').selectOption('master')
  await expect(pageA.locator('.sc-branch-select')).toHaveValue('master', { timeout: 10000 })

  await expect(pageA.locator('.cm-content')).toContainText('v1 on master', { timeout: 10000 })
  await expect(pageA.locator('.cm-content')).not.toContainText('feature-a')
  await expect(pageB.locator('.cm-content')).toContainText('v1 on master', { timeout: 10000 })
  await expect(pageB.locator('.cm-content')).not.toContainText('feature-a')

  await contextA.close()
  await contextB.close()
})

test('git mutation endpoints reject an unauthenticated caller and a viewer, even calling the API directly', async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'gitsec', 'private')
  const room = new URL(ownerPage.url()).pathname.slice(1)

  const viewerCtx = await browser.newContext()
  const viewerPage = await viewerCtx.newPage()
  await inviteAndJoin(ownerPage, viewerPage, 'gitsecviewer', 'viewer')
  const viewerToken = await viewerPage.evaluate(() => localStorage.getItem('account-token'))

  // Bypassing the UI entirely and hitting the REST endpoint straight on --
  // this is what the security fix actually guards, since the UI hiding the
  // Commit button never stopped anyone from doing this.
  const anonResponse = await viewerPage.request.post('http://localhost:1234/git/commit', {
    data: { room, message: 'malicious commit', sessionToken: null },
  })
  expect(anonResponse.ok()).toBe(false)

  const viewerResponse = await viewerPage.request.post('http://localhost:1234/git/commit', {
    data: { room, message: 'malicious commit', sessionToken: viewerToken },
  })
  expect(viewerResponse.ok()).toBe(false)

  await ownerPage.getByRole('button', { name: 'Source Control' }).click()
  await ownerPage.getByRole('button', { name: 'History' }).click()
  await expect(ownerPage.locator('.sc-empty')).toContainText('No commits yet')

  await ownerCtx.close()
  await viewerCtx.close()
})

test('the Activity panel logs file, commit, and membership events', async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'activity', 'private')

  await ownerPage.getByRole('button', { name: '+ New' }).click()
  await ownerPage.getByPlaceholder('filename.ext').fill('helper.py')
  await ownerPage.keyboard.press('Enter')

  await typeCode(ownerPage, 'console.log("v1")')
  await ownerPage.waitForTimeout(500)
  await ownerPage.getByRole('button', { name: 'Source Control' }).click()
  await ownerPage.locator('.sc-commit-box .text-input').fill('first commit')
  await ownerPage.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(ownerPage.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })
  await ownerPage.getByRole('button', { name: 'Close' }).click()

  const viewerCtx = await browser.newContext()
  const viewerPage = await viewerCtx.newPage()
  await inviteAndJoin(ownerPage, viewerPage, 'activityviewer', 'viewer')

  await ownerPage.getByRole('button', { name: 'Activity' }).click()
  await expect(ownerPage.locator('.activity-item', { hasText: 'created helper.py' })).toBeVisible()
  await expect(
    ownerPage.locator('.activity-item', { hasText: 'committed "first commit"' }),
  ).toBeVisible()
  await expect(ownerPage.locator('.activity-item', { hasText: 'joined as viewer' })).toBeVisible()

  await ownerCtx.close()
  await viewerCtx.close()
})

test('restoring an earlier commit updates the live content for everyone and adds a new commit', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'restore')
  await inviteAndJoin(pageA, pageB, 'restoreb', 'editor')

  await typeCode(pageA, 'console.log("v1")')
  await pageA.waitForTimeout(500)
  await pageA.getByRole('button', { name: 'Source Control' }).click()
  await pageA.locator('.sc-commit-box .text-input').fill('v1')
  await pageA.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })

  await pageA.locator('.cm-content').click()
  await pageA.keyboard.press('Control+A')
  await pageA.keyboard.type('console.log("v2")')
  await pageA.waitForTimeout(500)
  await pageA.locator('.sc-commit-box .text-input').fill('v2')
  await pageA.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })

  await pageA.getByRole('button', { name: 'History' }).click()
  await expect(pageA.locator('.sc-commit-item')).toHaveCount(2)

  pageA.once('dialog', (dialog) => dialog.accept())
  await pageA.locator('.sc-commit-item', { hasText: 'v1' }).getByRole('button', { name: 'Restore' }).click()

  await expect(pageA.locator('.sc-commit-item')).toHaveCount(3, { timeout: 10000 })
  await expect(pageA.locator('.cm-content')).toContainText('v1')
  await expect(pageA.locator('.cm-content')).not.toContainText('v2')
  await expect(pageB.locator('.cm-content')).toContainText('v1', { timeout: 10000 })

  await contextA.close()
  await contextB.close()
})

test('the Explain popover surfaces a clear error when no API key is configured, without touching the shared AI chat', async ({
  page,
}) => {
  await openNewProject(page, 'explain')
  await typeCode(page, 'function add(a, b) { return a + b }')

  await page.getByRole('button', { name: 'Explain', exact: true }).click()
  await expect(page.locator('.explain-popover .format-error')).toContainText('not configured', {
    timeout: 10000,
  })

  await page.getByRole('button', { name: 'AI Assistant' }).click()
  await expect(page.locator('.ai-chat-panel .sc-empty')).toBeVisible()
})

test('the API Test panel sends a real request from the browser and shows the response', async ({ page }) => {
  await openNewProject(page, 'apitest')

  await page.getByRole('button', { name: 'API Test' }).click()
  await page.locator('.api-url-input').fill('http://localhost:1234/')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.locator('.api-response-status')).toContainText('200', { timeout: 10000 })
  await expect(page.locator('.api-response-body')).toContainText('Yjs websocket server is running')
})

test('setting a breakpoint injects a logpoint and shows captured watch values per hit', async ({ page }) => {
  await openNewProject(page, 'breakpoint')

  // insertText (a single bulk input event) rather than the usual per-key
  // typeCode helper, so CodeMirror's bracket auto-closing -- which only
  // triggers on a single typed "{" keystroke, not a multi-line paste-like
  // insert -- doesn't leave a stray extra "}" behind.
  await page.locator('.cm-content').click()
  await page.keyboard.insertText(
    'let total = 0\nfor (let i = 1; i <= 3; i++) {\n  total += i\n}\nconsole.log(total)',
  )

  // Click the breakpoint gutter on the loop body's line (line 3).
  await page.locator('.cm-breakpoint-gutter .cm-gutterElement').nth(2).click()
  await expect(page.locator('.breakpoint-popover')).toBeVisible()
  await page.locator('.breakpoint-popover input').fill('i, total')
  await page.getByRole('button', { name: 'Set breakpoint' }).click()
  await expect(page.locator('.cm-breakpoint-marker')).toBeVisible()

  await page.getByRole('button', { name: /^▶ Run/ }).click()

  await expect(page.locator('.debug-hit-item')).toHaveCount(3, { timeout: 15000 })
  await expect(page.locator('.debug-hit-item').nth(0)).toContainText('i = 1')
  await expect(page.locator('.debug-hit-item').nth(0)).toContainText('total = 1')
  await expect(page.locator('.debug-hit-item').nth(2)).toContainText('i = 3')
  await expect(page.locator('.debug-hit-item').nth(2)).toContainText('total = 6')
  await expect(page.locator('.run-output-stdout')).toContainText('6')
})

test('real step-through debugging pauses at a breakpoint and shows live variables that update on resume', async ({
  page,
}) => {
  await openNewProject(page, 'realdebug', 'private')

  await page.locator('.cm-content').click()
  await page.keyboard.insertText(
    'let total = 0\nfor (let i = 1; i <= 3; i++) {\n  total += i\n}\nconsole.log(total)',
  )

  await page.locator('.cm-breakpoint-gutter .cm-gutterElement').nth(2).click()
  await expect(page.locator('.breakpoint-popover')).toBeVisible()
  await page.getByRole('button', { name: 'Set breakpoint' }).click()

  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  await page.getByRole('button', { name: '▶ Start Debugging' }).click()

  await expect(page.locator('.debug-status')).toContainText('Paused at line 3', { timeout: 20000 })
  await expect(page.locator('.debug-var-item', { hasText: /^i1$/ })).toBeVisible()
  await expect(page.locator('.debug-var-item', { hasText: /^total0$/ })).toBeVisible()

  await page.getByRole('button', { name: '▶ Resume' }).click()
  await expect(page.locator('.debug-var-item', { hasText: /^i2$/ })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.debug-var-item', { hasText: /^total1$/ })).toBeVisible()

  await page.getByRole('button', { name: '■ Stop' }).click()
  await expect(page.locator('.debug-status')).toContainText('Exited')
})

test('real debugging is rejected for a public project even for its owner, and for a viewer on a private one', async ({
  browser,
}) => {
  // Public project, owner (editor+) tries to connect directly -- rejected on
  // visibility alone, since a public project's anonymous viewers could
  // otherwise reach the same endpoint through the same UI.
  const publicCtx = await browser.newContext()
  const publicPage = await publicCtx.newPage()
  await openNewProject(publicPage, 'debugsecpub', 'public')
  const publicRoom = new URL(publicPage.url()).pathname.slice(1)
  const publicToken = await publicPage.evaluate(() => localStorage.getItem('account-token'))
  const publicCloseCode = await publicPage.evaluate(
    ({ room, token }) =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:1234/__debug?room=${room}&token=${token}`)
        ws.onclose = (e) => resolve(e.code)
      }),
    { room: publicRoom, token: publicToken },
  )
  expect(publicCloseCode).toBe(4003)
  await publicCtx.close()

  // Private project, but the caller is only a viewer -- rejected on role.
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await openNewProject(ownerPage, 'debugsecpriv', 'private')
  const viewerCtx = await browser.newContext()
  const viewerPage = await viewerCtx.newPage()
  await inviteAndJoin(ownerPage, viewerPage, 'debugsecviewer', 'viewer')
  const privateRoom = new URL(viewerPage.url()).pathname.slice(1)
  const viewerToken = await viewerPage.evaluate(() => localStorage.getItem('account-token'))
  const viewerCloseCode = await viewerPage.evaluate(
    ({ room, token }) =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:1234/__debug?room=${room}&token=${token}`)
        ws.onclose = (e) => resolve(e.code)
      }),
    { room: privateRoom, token: viewerToken },
  )
  expect(viewerCloseCode).toBe(4003)

  await ownerCtx.close()
  await viewerCtx.close()
})

// Runs against a real, disposable Postgres container (postgres:16-alpine,
// seeded with a two-row "widgets" table) rather than mocking the database
// layer -- the entire point of this feature is that Postgres itself, not
// application code, is what rejects a write, and that's not something a
// mock can meaningfully stand in for.
const TEST_DB_CONNECTION = 'postgres://postgres:test@127.0.0.1:5432/postgres'

test('the Database panel runs a read-only query against Postgres and rejects a write', async ({ page }) => {
  await openNewProject(page, 'dbtest', 'private')

  await page.getByRole('button', { name: 'Database' }).click()
  await page.getByPlaceholder('postgres://user:password@host:5432/dbname').fill(TEST_DB_CONNECTION)
  await page.getByPlaceholder('SELECT * FROM ...').fill('SELECT * FROM widgets ORDER BY id')
  await page.getByRole('button', { name: 'Run Query (read-only)' }).click()

  await expect(page.locator('.database-table')).toContainText('sprocket', { timeout: 10000 })
  await expect(page.locator('.database-table')).toContainText('gadget')

  await page.getByPlaceholder('SELECT * FROM ...').fill("INSERT INTO widgets (name) VALUES ('nope')")
  await page.getByRole('button', { name: 'Run Query (read-only)' }).click()
  await expect(page.locator('.format-error')).toContainText('read-only transaction', { timeout: 10000 })
})

test('the Database panel is rejected for a public project even for its owner', async ({ page }) => {
  await openNewProject(page, 'dbtestpublic', 'public')

  await page.getByRole('button', { name: 'Database' }).click()
  await page.getByPlaceholder('postgres://user:password@host:5432/dbname').fill(TEST_DB_CONNECTION)
  await page.getByPlaceholder('SELECT * FROM ...').fill('SELECT 1')
  await page.getByRole('button', { name: 'Run Query (read-only)' }).click()

  await expect(page.locator('.format-error')).toContainText('private projects', { timeout: 10000 })
})

test('Install & Run installs dependencies and runs the entry file in a real container', async ({ page }) => {
  await openNewProject(page, 'installrun', 'private')

  await page.getByRole('button', { name: '+ New' }).click()
  await page.getByPlaceholder('filename.ext').fill('package.json')
  await page.keyboard.press('Enter')
  await page.locator('.cm-content').click()
  await page.keyboard.insertText('{"name": "test", "version": "1.0.0"}')

  await page.locator('.file-tree-item', { hasText: 'main.js' }).click()
  await typeCode(page, 'console.log("installed and ran")')

  await page.getByRole('button', { name: 'Install & Run' }).click()
  await expect(page.locator('.run-output')).toContainText('installed and ran', { timeout: 30000 })
  await expect(page.locator('.run-output-exit')).toContainText('Exit code: 0')
})

test('Install & Run is rejected for a public project even for its owner', async ({ page }) => {
  // A short label: uniqueUsername truncates to 20 chars total, and since
  // Date.now().toString(36) is most-significant-digit-first, a long label
  // leaves so little of the timestamp+random suffix that two runs close in
  // time can produce the exact same username -- a real collision this test
  // hit, not flakiness.
  await openNewProject(page, 'pkgrunpub', 'public')
  const room = new URL(page.url()).pathname.slice(1)
  const token = await page.evaluate(() => localStorage.getItem('account-token'))
  const closeCode = await page.evaluate(
    ({ room, token }) =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:1234/__runpkg?room=${room}&token=${token}`)
        ws.onclose = (e) => resolve(e.code)
      }),
    { room, token },
  )
  expect(closeCode).toBe(4003)
})

test('the Test panel runs Node built-in tests against another file and shows pass/fail results', async ({
  page,
}) => {
  await openNewProject(page, 'testrunner')

  await typeCode(page, 'function add(a, b) { return a + b }\nmodule.exports = { add }')

  await page.getByRole('button', { name: '+ New' }).click()
  await page.getByPlaceholder('filename.ext').fill('math.test.js')
  await page.keyboard.press('Enter')

  await typeCode(
    page,
    "const { test } = require('node:test')\n" +
      "const assert = require('node:assert')\n" +
      "const { add } = require('./main.js')\n" +
      "test('adds numbers', () => { assert.strictEqual(add(2, 3), 5) })\n" +
      "test('fails on purpose', () => { assert.strictEqual(add(2, 2), 5) })",
  )
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Run Tests' }).click()

  await expect(page.locator('.test-item-pass')).toContainText('adds numbers', { timeout: 15000 })
  await expect(page.locator('.test-item-fail')).toContainText('fails on purpose')
})

test('the AI Assistant panel surfaces a clear error when no API key is configured', async ({ page }) => {
  await openNewProject(page, 'aiassistant')

  await page.getByRole('button', { name: 'AI Assistant' }).click()
  await page.locator('.ai-chat-panel .text-input').fill('What does this file do?')
  await page.locator('.ai-chat-panel button', { hasText: 'Ask' }).click()

  await expect(page.locator('.format-error')).toContainText('not configured', { timeout: 10000 })
})

test('requesting a review, viewing the diff against a base branch, and approving it works live for both users', async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openNewProject(pageA, 'review')
  const bUsername = await inviteAndJoin(pageA, pageB, 'reviewb', 'editor')

  await typeCode(pageA, 'console.log("base")')
  await pageA.waitForTimeout(500)
  await pageA.getByRole('button', { name: 'Source Control' }).click()
  await pageA.locator('.sc-commit-box .text-input').fill('base commit')
  await pageA.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })

  await pageA.locator('.sc-branch-input').fill('feature')
  await pageA.locator('.sc-branch-bar button', { hasText: 'Create' }).click()
  await expect(pageA.locator('.sc-branch-select')).toHaveValue('feature', { timeout: 10000 })

  await pageA.locator('.cm-content').click()
  await pageA.keyboard.press('Control+A')
  await pageA.keyboard.type('console.log("feature change")')
  await pageA.waitForTimeout(500)
  await pageA.locator('.sc-commit-box .text-input').fill('feature change')
  await pageA.locator('.sc-commit-box button', { hasText: 'Commit' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No changes', { timeout: 10000 })
  await pageA.getByRole('button', { name: 'Close' }).click()

  await pageA.getByRole('button', { name: 'Review' }).click()
  await expect(pageA.locator('.review-panel option', { hasText: 'master' })).toHaveCount(1)
  await pageA.locator('.review-panel select').selectOption('master')
  await pageA.getByRole('button', { name: 'Request Review' }).click()
  await expect(pageA.locator('.review-status')).toContainText('Awaiting review')

  // B (never having done anything but join) sees the same review live, since
  // it's shared project state, not per-user.
  await pageB.getByRole('button', { name: 'Review' }).click()
  await expect(pageB.locator('.review-meta')).toContainText('feature')
  await expect(pageB.locator('.review-meta')).toContainText('master')

  await pageB.locator('.sc-file-item').first().click()
  await expect(pageB.locator('.sc-diff')).toContainText('feature change')

  await pageB.getByRole('button', { name: 'Approve' }).click()
  await expect(pageB.locator('.review-status')).toContainText('Approved')
  await expect(pageA.locator('.review-status')).toContainText('Approved', { timeout: 10000 })
  await expect(pageA.locator('.review-decision-item')).toContainText(bUsername)

  await pageA.getByRole('button', { name: 'Close review' }).click()
  await expect(pageA.locator('.sc-empty')).toContainText('No open review')
  await expect(pageB.locator('.sc-empty')).toContainText('No open review', { timeout: 10000 })

  await contextA.close()
  await contextB.close()
})
