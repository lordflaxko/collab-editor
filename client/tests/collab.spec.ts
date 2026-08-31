import { test, expect, type Page } from '@playwright/test'

// The Run/Format tests exercise the sync server's /run and /format proxies,
// which in turn need the self-hosted Piston container (docker run ... piston)
// and Python+Black to be available. Everything else only needs the two dev
// servers Playwright already starts.

function uniqueRoom(label: string) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function uniqueUsername(label: string) {
  return `${label}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 20)
}

async function openRoom(page: Page, room: string, passphrase = '') {
  await page.goto(`/${room}`)
  await page.getByPlaceholder('Passphrase (optional)').fill(passphrase)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await page.waitForSelector('.cm-content')
}

async function typeCode(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.type(text)
}

test('fresh visit with no path auto-generates a room id in the URL', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder('Passphrase (optional)')).toBeVisible()
  expect(new URL(page.url()).pathname).not.toBe('/')
})

test('two clients in the same document sync typed code', async ({ browser }) => {
  const room = uniqueRoom('sync')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, room)
  await openRoom(pageB, room)

  await typeCode(pageA, 'const hello = "from A"')

  await expect(pageB.locator('.cm-content')).toContainText('from A')

  await contextA.close()
  await contextB.close()
})

test('two different documents do not share content', async ({ browser }) => {
  const roomA = uniqueRoom('alpha')
  const roomB = uniqueRoom('beta')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, roomA)
  await typeCode(pageA, 'const alphaOnly = true')

  await openRoom(pageB, roomB)
  await pageB.waitForTimeout(1000)
  await expect(pageB.locator('.cm-content')).not.toContainText('alphaOnly')

  await contextA.close()
  await contextB.close()
})

test('reopening the same document id in a new tab restores its content', async ({ browser }) => {
  const room = uniqueRoom('persist')
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  await openRoom(page1, room)
  await typeCode(page1, 'const saved = "content"')
  await page1.waitForTimeout(500) // let the update flush to the server
  await context1.close()

  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await openRoom(page2, room)
  await expect(page2.locator('.cm-content')).toContainText('saved')
  await context2.close()
})

test('the doc bar lets you jump to another document by id', async ({ page }) => {
  const room = uniqueRoom('jump')
  await page.goto('/')

  await page.getByPlaceholder('Open document id…').fill(room)
  await page.getByRole('button', { name: 'Open' }).click()

  await expect(page.locator('.doc-id code')).toHaveText(room)
  expect(new URL(page.url()).pathname).toBe(`/${room}`)
})

test('a passphrase set at creation is required to reopen the document elsewhere', async ({
  browser,
}) => {
  const room = uniqueRoom('secure')
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  await openRoom(page1, room, 'correct-horse')
  await typeCode(page1, 'const secret = "content"')
  await page1.waitForTimeout(500)
  await context1.close()

  // Wrong passphrase from a fresh browser context (no remembered session) is rejected.
  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await page2.goto(`/${room}`)
  await page2.getByPlaceholder('Passphrase (optional)').fill('wrong-guess')
  await page2.getByRole('button', { name: 'Continue' }).click()
  await expect(page2.getByText('Incorrect passphrase.')).toBeVisible()
  await context2.close()

  // Correct passphrase connects and shows the saved content.
  const context3 = await browser.newContext()
  const page3 = await context3.newPage()
  await openRoom(page3, room, 'correct-horse')
  await expect(page3.locator('.cm-content')).toContainText('secret')
  await context3.close()
})

test('setting your name shows up in the other client\'s presence list', async ({ browser }) => {
  const room = uniqueRoom('presence')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await pageA.goto(`/${room}`)
  await pageA.getByLabel('Your name').fill('Alice')
  await pageA.getByPlaceholder('Passphrase (optional)').fill('')
  await pageA.getByRole('button', { name: 'Continue' }).click()
  await expect(pageA.getByText('Connected', { exact: true })).toBeVisible()

  await openRoom(pageB, room)

  await expect(pageB.locator('.presence-chip', { hasText: 'Alice' })).toBeVisible()

  await contextA.close()
  await contextB.close()
})

test('a remote client sees the other user\'s live cursor and selection highlight', async ({
  browser,
}) => {
  const room = uniqueRoom('cursor')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await pageA.goto(`/${room}`)
  await pageA.getByLabel('Your name').fill('Alice')
  await pageA.getByPlaceholder('Passphrase (optional)').fill('')
  await pageA.getByRole('button', { name: 'Continue' }).click()
  await expect(pageA.getByText('Connected', { exact: true })).toBeVisible()
  await pageA.waitForSelector('.cm-content')

  await openRoom(pageB, room)

  await typeCode(pageA, 'const hello = "world"')
  // Select the word "world" on A's side so B should see a selection highlight too.
  await pageA.keyboard.press('Shift+Home')

  // B should see a remote caret widget carrying Alice's name.
  await expect(pageB.locator('.cm-ySelectionInfo', { hasText: 'Alice' })).toBeAttached({
    timeout: 10000,
  })
  // ...and a selection-highlight decoration for the range Alice selected.
  await expect(pageB.locator('.cm-ySelection').first()).toBeAttached()

  await contextA.close()
  await contextB.close()
})

test('a join/leave notification appears when a peer connects or disconnects', async ({
  browser,
}) => {
  const room = uniqueRoom('joinleave')
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  await openRoom(pageA, room)

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await pageB.goto(`/${room}`)
  await pageB.getByLabel('Your name').fill('Bob')
  await pageB.getByPlaceholder('Passphrase (optional)').fill('')
  await pageB.getByRole('button', { name: 'Continue' }).click()
  await expect(pageB.getByText('Connected', { exact: true })).toBeVisible()

  await expect(pageA.locator('.toast', { hasText: 'Bob joined' })).toBeVisible()

  await contextB.close()
  await expect(pageA.locator('.toast', { hasText: 'Bob left' })).toBeVisible({ timeout: 10000 })

  await contextA.close()
})

test('creating a file adds it to the tree, and each file keeps separate content', async ({
  page,
}) => {
  const room = uniqueRoom('files')
  await openRoom(page, room)

  // The room starts with a default file.
  await expect(page.locator('.file-tree-item')).toHaveCount(1)
  await typeCode(page, 'const inMain = true')

  await page.getByRole('button', { name: '+ New' }).click()
  await page.getByPlaceholder('filename.ext').fill('helper.py')
  await page.keyboard.press('Enter')

  await expect(page.locator('.file-tree-item')).toHaveCount(2)
  await expect(page.locator('.language-picker')).toHaveValue('python')
  // Switching to the new file shows an empty editor, not main.js's content.
  await expect(page.locator('.cm-content')).not.toContainText('inMain')

  await typeCode(page, 'def helper():\n    pass')

  // Switching back to main.js shows its own content, untouched.
  await page.locator('.file-tree-item', { hasText: 'main.js' }).click()
  await expect(page.locator('.cm-content')).toContainText('inMain')
  await expect(page.locator('.cm-content')).not.toContainText('helper')
})

test('the language picker overrides a file\'s language independent of its extension', async ({
  page,
}) => {
  const room = uniqueRoom('langpicker')
  await openRoom(page, room)

  await expect(page.locator('.language-picker')).toHaveValue('javascript')

  await page.locator('.language-picker').selectOption('python')

  await expect(page.locator('.language-picker')).toHaveValue('python')
  // main.js's extension is untouched by picking a different language.
  await expect(page.locator('.file-tree-item')).toHaveText(/main\.js/)
})

test('the theme toggle cycles Auto -> Light -> Dark and forces the color scheme', async ({
  page,
}) => {
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
  const room = uniqueRoom('syntax')
  await openRoom(page, room)

  await typeCode(page, 'const x = ;')
  await expect(page.locator('.cm-gutter-lint .cm-lint-marker-error')).toBeVisible()

  await page.keyboard.press('Control+A')
  await page.keyboard.type('const x = 1;')
  await expect(page.locator('.cm-gutter-lint .cm-lint-marker-error')).toHaveCount(0)
})

test('the Format button formats JavaScript via Prettier', async ({ page }) => {
  const room = uniqueRoom('format')
  await openRoom(page, room)

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
    const room = uniqueRoom(`format-${language}`)
    await openRoom(page, room)

    await page.locator('.language-picker').selectOption(language)
    await typeCode(page, unformatted)
    await page.getByRole('button', { name: 'Format' }).click()

    await expect(page.locator('.cm-content')).toContainText(expected, { timeout: 15000 })
  })
}

test('the Run button executes code against the sandbox and shows stdout', async ({ page }) => {
  const room = uniqueRoom('run')
  await openRoom(page, room)

  await typeCode(page, 'console.log(2 + 2)')
  await page.getByRole('button', { name: /Run/ }).click()

  await expect(page.locator('.run-output-stdout')).toContainText('4', { timeout: 20000 })
})

test('a chat message and its reply sync to another client', async ({ browser }) => {
  const room = uniqueRoom('chat')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, room)
  await openRoom(pageB, room)

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

test('an inline code comment thread syncs, replies, and resolves across clients', async ({
  browser,
}) => {
  const room = uniqueRoom('comment')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, room)
  await openRoom(pageB, room)

  await typeCode(pageA, 'const total = a + b')
  await expect(pageB.locator('.cm-content')).toContainText('total')

  // Select the whole line on A and leave a comment.
  await pageA.locator('.cm-content').click()
  await pageA.keyboard.press('Home')
  await pageA.keyboard.press('Shift+End')
  await pageA.getByRole('button', { name: 'Comment', exact: true }).click()
  await pageA.locator('.comment-textarea').fill('is this the right formula?')
  await pageA.locator('.comment-popover-actions button', { hasText: 'Comment' }).click()

  // B should see the gutter marker appear without doing anything.
  await expect(pageB.locator('.cm-comment-marker')).toBeVisible({ timeout: 10000 })

  await pageB.locator('.cm-comment-marker').click()
  await expect(pageB.locator('.comment-popover')).toContainText('is this the right formula?')
  await pageB
    .locator('.comment-popover .comment-reply-form .text-input')
    .fill('yes, matches the spec')
  await pageB.locator('.comment-popover .comment-reply-form button', { hasText: 'Reply' }).click()

  // Submitting a new thread closes A's popover, so reopen it via the marker
  // to check B's reply arrives live.
  await pageA.locator('.cm-comment-marker').click()
  await expect(pageA.locator('.comment-popover')).toContainText('yes, matches the spec')

  await pageA.getByRole('button', { name: 'Resolve' }).click()
  await expect(pageA.locator('.cm-comment-marker')).toHaveCount(0)
  await expect(pageB.locator('.cm-comment-marker')).toHaveCount(0, { timeout: 10000 })

  await contextA.close()
  await contextB.close()
})

test('mentioning a present participant autocompletes and renders highlighted', async ({
  browser,
}) => {
  const room = uniqueRoom('mention')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await pageA.goto(`/${room}`)
  await pageA.getByLabel('Your name').fill('Alice')
  await pageA.getByPlaceholder('Passphrase (optional)').fill('')
  await pageA.getByRole('button', { name: 'Continue' }).click()
  await expect(pageA.getByText('Connected', { exact: true })).toBeVisible()

  await pageB.goto(`/${room}`)
  await pageB.getByLabel('Your name').fill('Bobby')
  await pageB.getByPlaceholder('Passphrase (optional)').fill('')
  await pageB.getByRole('button', { name: 'Continue' }).click()
  await expect(pageB.getByText('Connected', { exact: true })).toBeVisible()
  await expect(pageA.locator('.presence-chip', { hasText: 'Bobby' })).toBeVisible()

  await pageA.getByRole('button', { name: 'Chat' }).click()
  await pageA.locator('.chat-compose .text-input').pressSequentially('hi @bob')
  await expect(pageA.locator('.mention-suggestions')).toContainText('@Bobby')
  await pageA.locator('.mention-suggestions button', { hasText: '@Bobby' }).click()
  await pageA.locator('.chat-compose .text-input').pressSequentially('welcome')
  await pageA.locator('.chat-compose button', { hasText: 'Send' }).click()

  await expect(pageA.locator('.chat-message .mention')).toHaveText('@Bobby')

  await contextA.close()
  await contextB.close()
})

test('an emoji reaction toggled by one client is visible to another', async ({ browser }) => {
  const room = uniqueRoom('reaction')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, room)
  await openRoom(pageB, room)

  await pageA.getByRole('button', { name: 'Chat' }).click()
  await pageA.locator('.chat-compose .text-input').fill('react to this')
  await pageA.locator('.chat-compose button', { hasText: 'Send' }).click()

  await pageB.getByRole('button', { name: 'Chat' }).click()
  await expect(pageB.locator('.chat-message')).toContainText('react to this')
  await pageB.locator('.reaction-add-btn').click()
  await pageB.locator('.reaction-picker-popover input[type="text"]').fill('grinning face')
  await pageB.locator('.reaction-picker-popover ul button').first().click()

  await expect(pageA.locator('.reaction-pill')).toBeVisible({ timeout: 10000 })

  // Clicking the same pill toggles it off for that user.
  await pageB.locator('.reaction-pill').click()
  await expect(pageA.locator('.reaction-pill')).toHaveCount(0, { timeout: 10000 })

  await contextA.close()
  await contextB.close()
})

test('mentioning a registered account delivers a notification they see after signing in', async ({
  browser,
}) => {
  const room = uniqueRoom('notify')
  const targetUsername = uniqueUsername('target')

  const contextTarget = await browser.newContext()
  const pageTarget = await contextTarget.newPage()
  await pageTarget.goto('/')
  await pageTarget.getByRole('button', { name: 'Log in' }).click()
  await pageTarget.getByRole('button', { name: 'Sign up instead' }).click()
  await pageTarget.getByLabel('Account username').fill(targetUsername)
  await pageTarget.getByLabel('Account password').fill('correct-horse-battery')
  await pageTarget.getByRole('button', { name: 'Sign up' }).click()
  await expect(pageTarget.getByText(`Signed in as ${targetUsername}`)).toBeVisible()
  // Log out so the mention below happens while they're fully offline.
  await pageTarget.getByRole('button', { name: 'Log out' }).click()

  const contextSender = await browser.newContext()
  const pageSender = await contextSender.newPage()
  await openRoom(pageSender, room)
  await pageSender.getByRole('button', { name: 'Chat' }).click()
  await pageSender.locator('.chat-compose .text-input').fill(`hey @${targetUsername} look at this`)
  await pageSender.locator('.chat-compose button', { hasText: 'Send' }).click()

  await pageTarget.getByRole('button', { name: 'Log in' }).click()
  await pageTarget.getByLabel('Account username').fill(targetUsername)
  await pageTarget.getByLabel('Account password').fill('correct-horse-battery')
  await pageTarget.getByRole('button', { name: 'Log in' }).click()
  await expect(pageTarget.getByText(`Signed in as ${targetUsername}`)).toBeVisible()

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
  // The free-text name field defers to the account identity once signed in.
  await expect(page.getByLabel('Your name')).toBeDisabled()
  await expect(page.getByLabel('Your name')).toHaveValue(username)
})

test('a wrong password is rejected and a correct one logs back in after logout', async ({
  page,
}) => {
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
  const username = uniqueUsername('persist')
  await page.goto('/')

  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Sign up instead' }).click()
  await page.getByLabel('Account username').fill(username)
  await page.getByLabel('Account password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()

  await page.reload()

  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible()
})

test("a signed-in account's username is used as the collaborator identity", async ({
  browser,
}) => {
  const username = uniqueUsername('collabid')
  const room = uniqueRoom('collabid')
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()

  await pageA.goto(`/${room}`)
  await pageA.getByRole('button', { name: 'Log in' }).click()
  await pageA.getByRole('button', { name: 'Sign up instead' }).click()
  await pageA.getByLabel('Account username').fill(username)
  await pageA.getByLabel('Account password').fill('correct-horse-battery')
  await pageA.getByRole('button', { name: 'Sign up' }).click()
  await expect(pageA.getByText(`Signed in as ${username}`)).toBeVisible()

  await pageA.getByPlaceholder('Passphrase (optional)').fill('')
  await pageA.getByRole('button', { name: 'Continue' }).click()
  await expect(pageA.getByText('Connected', { exact: true })).toBeVisible()

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await openRoom(pageB, room)

  await expect(pageB.locator('.presence-chip', { hasText: username })).toBeVisible()

  await contextA.close()
  await contextB.close()
})
