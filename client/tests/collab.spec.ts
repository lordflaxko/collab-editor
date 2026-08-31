import { test, expect, type Page } from '@playwright/test'

// The Run/Format tests exercise the sync server's /run and /format proxies,
// which in turn need the self-hosted Piston container (docker run ... piston)
// and Python+Black to be available. Everything else only needs the two dev
// servers Playwright already starts.

function uniqueRoom(label: string) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
  await expect(page.locator('.language-badge')).toHaveText('Python')
  // Switching to the new file shows an empty editor, not main.js's content.
  await expect(page.locator('.cm-content')).not.toContainText('inMain')

  await typeCode(page, 'def helper():\n    pass')

  // Switching back to main.js shows its own content, untouched.
  await page.locator('.file-tree-item', { hasText: 'main.js' }).click()
  await expect(page.locator('.cm-content')).toContainText('inMain')
  await expect(page.locator('.cm-content')).not.toContainText('helper')
})

test('the Format button formats JavaScript via Prettier', async ({ page }) => {
  const room = uniqueRoom('format')
  await openRoom(page, room)

  await typeCode(page, 'function add(a,b){return a+b}')
  await page.getByRole('button', { name: 'Format' }).click()

  await expect(page.locator('.cm-content')).toContainText('function add(a, b) {')
})

test('the Run button executes code against the sandbox and shows stdout', async ({ page }) => {
  const room = uniqueRoom('run')
  await openRoom(page, room)

  await typeCode(page, 'console.log(2 + 2)')
  await page.getByRole('button', { name: /Run/ }).click()

  await expect(page.locator('.run-output-stdout')).toContainText('4', { timeout: 20000 })
})
