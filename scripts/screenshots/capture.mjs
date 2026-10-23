// Takes the guide's screenshots from an instance seeded by seedScreenshotWorkspace.ts.
//
//   BASE_URL=http://localhost:3100 SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
//   node scripts/screenshots/capture.mjs [name ...]
//
// Writes PNGs to OUT_DIR (default docs/guide/images), light and, where the guide has one, dark.
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.BASE_URL ?? 'http://localhost:3100'
const outDir = process.env.OUT_DIR ?? path.resolve(here, '../../docs/guide/images')
const only = process.argv.slice(2)

const settle = (page, ms = 2000) => page.waitForTimeout(ms)

async function open(page, url) {
  await page.goto(`${base}${url}`)
  await page.waitForLoadState('load')
  await settle(page)
}

async function scrollTo(page, locator) {
  await locator.first().scrollIntoViewIfNeeded()
  await locator.first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await settle(page, 500)
}

const SHOTS = [
  { name: 'space-board', dark: false, run: (page) => open(page, '/spaces/storefront') },
  {
    name: 'agent-question',
    run: async (page) => {
      await open(page, '/spaces/storefront/tasks/STO-15')
      await scrollTo(page, page.getByText("It's for you", { exact: false }))
    },
  },
  {
    name: 'task-thread',
    run: async (page) => {
      await open(page, '/spaces/storefront/tasks/STO-14')
      const quote = page.getByText('read from the campaign config so marketing can change it without a release', { exact: false })
      await scrollTo(page, quote)
      await quote.first().click()
      await settle(page, 600)
    },
  },
  {
    name: 'plan-version-compare',
    run: async (page) => {
      await open(page, '/spaces/storefront/tasks/STO-14')
      await page.getByRole('button', { name: 'Compare versions' }).first().click()
      await settle(page)
      await scrollTo(page, page.locator('ins').nth(1))
    },
  },
  {
    name: 'run-details',
    run: async (page) => {
      await open(page, '/spaces/storefront/tasks/STO-14')
      await page.getByText('Run details', { exact: false }).first().click()
      await settle(page, 1500)
    },
  },
  {
    name: 'taken-over',
    run: async (page) => {
      await open(page, '/spaces/storefront/tasks/STO-17')
      await scrollTo(page, page.getByRole('button', { name: /Hand back/ }))
    },
  },
  {
    name: 'plan-comment',
    run: async (page) => {
      await open(page, '/spaces/product-marketing/tasks/PM-1')
      await page.getByRole('tab', { name: /Plan/ }).first().click()
      await settle(page, 800)
      const line = page.getByText('Mobile app: offline mode and push alerts', { exact: false }).last()
      await scrollTo(page, line)
      // Selects the words as a person would, which brings up the comment button.
      await line.evaluate((element, phrase) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.textContent.indexOf(phrase)
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + phrase.length)
          getSelection().removeAllRanges()
          getSelection().addRange(range)
          node.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
          return
        }
      }, 'offline mode and push alerts')
      await page.getByRole('button', { name: 'Comment or suggest' }).click()
      await page.getByLabel('Comment', { exact: true }).fill('Open this slide with the field sales quote about offline mode. It lands better than the feature list.')
      await settle(page, 500)
    },
  },
  {
    name: 'create-task',
    run: async (page) => {
      await open(page, '/spaces/product-marketing/tasks/new')
      await page.getByLabel(/Title/i).first().fill('Write the October customer newsletter')
      await page
        .getByLabel(/Description|What do you need/i)
        .first()
        .fill(
          'Draft the October newsletter from notes/q3-release-notes.md, in the tone of notes/brand-voice.md. Lead with shared dashboards and keep it under 300 words.',
        )
      await page.getByText('Optional details').click()
      await settle(page, 500)
    },
  },
  {
    name: 'files-editor',
    run: async (page) => {
      await open(page, '/spaces/product-marketing/files')
      const row = page.locator('li, tr, div').filter({ hasText: /^brand-voice\.md/ }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
      await row.getByRole('button', { name: 'Edit' }).click()
      await settle(page)
    },
  },
  {
    name: 'artifact-preview',
    run: async (page) => {
      await open(page, '/spaces/product-marketing/artifacts')
      await page.getByText('Q3 product update deck').first().click()
      await page.waitForLoadState('load')
      await settle(page, 2500)
    },
  },
  { name: 'schedules', run: (page) => open(page, '/spaces/product-marketing/schedules') },
  { name: 'incoming-issues', dark: false, height: 1030, run: (page) => open(page, '/spaces/tokenobserver/settings/issues') },
  { name: 'track-record', run: (page) => open(page, '/spaces/storefront/track-record') },
]

async function signIn(page) {
  await page.goto(`${base}/login`)
  await page.getByLabel('Email').fill(process.env.SEED_ADMIN_EMAIL)
  await page.getByLabel('Password').fill(process.env.SEED_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Login' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

const browser = await chromium.launch()
try {
  for (const theme of ['light', 'dark']) {
    for (const shot of SHOTS) {
      if (only.length && !only.includes(shot.name)) continue
      if (theme === 'dark' && shot.dark === false) continue
      const context = await browser.newContext({ viewport: { width: 1440, height: shot.height ?? 900 }, deviceScaleFactor: 1 })
      context.setDefaultTimeout(8000)
      await context.addInitScript((value) => localStorage.setItem('theme', value), theme)
      const page = await context.newPage()
      try {
        await signIn(page)
        await shot.run(page)
        const file = path.join(outDir, `${shot.name}${theme === 'dark' ? '-dark' : ''}.png`)
        await page.screenshot({ path: file })
        console.log(`wrote ${path.relative(process.cwd(), file)}`)
      } catch (error) {
        console.error(`${shot.name} (${theme}) failed: ${error.message.split('\n')[0]}`)
        await page.screenshot({ path: path.join(outDir, `failed-${shot.name}-${theme}.png`) }).catch(() => {})
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
