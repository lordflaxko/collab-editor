import { test, expect, type Page } from '@playwright/test'

function uniqueRoom(label: string) {
  return `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function openRoom(page: Page, room: string) {
  await page.goto(`/${room}`)
  await expect(page.getByText('Sync: connected')).toBeVisible()
}

test('fresh visit with no path auto-generates a room id in the URL', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Sync: connected')).toBeVisible()
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
  await expect(page.getByText('Sync: connected')).toBeVisible()

  await page.getByPlaceholder('Open document id…').fill(room)
  await page.getByRole('button', { name: 'Open' }).click()

  await expect(page.locator('.doc-id code')).toHaveText(room)
  expect(new URL(page.url()).pathname).toBe(`/${room}`)
})
