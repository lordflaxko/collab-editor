import { test, expect, type Page } from '@playwright/test'

function uniqueRoom(label: string) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function openRoom(page: Page, room: string, passphrase = '') {
  await page.goto(`/${room}`)
  await page.getByPlaceholder('Passphrase (optional)').fill(passphrase)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
}

test('fresh visit with no path auto-generates a room id in the URL', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder('Passphrase (optional)')).toBeVisible()
  expect(new URL(page.url()).pathname).not.toBe('/')
})

test('two clients in the same document sync typed text', async ({ browser }) => {
  const room = uniqueRoom('sync')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, room)
  await openRoom(pageB, room)

  await pageA.locator('.tiptap').click()
  await pageA.keyboard.type('Hello from A')

  await expect(pageB.getByText('Hello from A')).toBeVisible()

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
  await pageA.locator('.tiptap').click()
  await pageA.keyboard.type('Alpha only content')

  await openRoom(pageB, roomB)
  await pageB.waitForTimeout(1000)
  await expect(pageB.locator('.tiptap')).not.toContainText('Alpha only content')

  await contextA.close()
  await contextB.close()
})

test('reopening the same document id in a new tab restores its content', async ({ browser }) => {
  const room = uniqueRoom('persist')
  const context1 = await browser.newContext()
  const page1 = await context1.newPage()
  await openRoom(page1, room)
  await page1.locator('.tiptap').click()
  await page1.keyboard.type('Saved content')
  await page1.waitForTimeout(500) // let the update flush to the server
  await context1.close()

  const context2 = await browser.newContext()
  const page2 = await context2.newPage()
  await openRoom(page2, room)
  await expect(page2.getByText('Saved content')).toBeVisible()
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
  await page1.locator('.tiptap').click()
  await page1.keyboard.type('Secret content')
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
  await expect(page3.getByText('Secret content')).toBeVisible()
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

test('the slash menu inserts a table, and images sync to other clients', async ({ browser }) => {
  const room = uniqueRoom('blocks')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await openRoom(pageA, room)

  await pageA.locator('.tiptap').click()
  await pageA.keyboard.type('/table')
  await expect(pageA.locator('.slash-menu')).toBeVisible()
  await pageA.keyboard.press('Enter')
  await expect(pageA.locator('table')).toBeVisible()

  await pageA.keyboard.press('Control+End')
  await pageA.keyboard.press('Enter')
  pageA.once('dialog', (dialog) => dialog.accept('https://example.com/test-image.png'))
  await pageA.getByTitle('Insert image').click()
  await expect(pageA.locator('.tiptap img')).toBeVisible()

  await openRoom(pageB, room)
  await expect(pageB.locator('table')).toBeVisible()
  await expect(pageB.locator('.tiptap img')).toBeVisible()

  await contextA.close()
  await contextB.close()
})
