import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = 'http://127.0.0.1:4180'
const output = resolve(process.argv[2] ?? '../docs/影片素材/prototype-2026-09-25-v2')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1280, height: 720 } },
  reducedMotion: 'reduce',
})
const page = await context.newPage()
const startedAt = Date.now()
const chapters = []
const chapter = async (name, image, hold = 1800) => {
  await page.waitForTimeout(400)
  chapters.push({ name, second: Number(((Date.now() - startedAt) / 1000).toFixed(2)), image })
  await page.screenshot({ path: resolve(output, image), animations: 'disabled' })
  await page.waitForTimeout(hold)
}
const focusReportContent = async () => {
  await page.evaluate(() => {
    const panel = document.querySelector('.report-tab-content')
    if (panel) window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - 72, behavior: 'instant' })
  })
}

try {
  await page.goto(`${base}/line?state=invite&present=1`)
  await page.getByRole('button', { name: '開始轉電診斷' }).waitFor()
  await chapter('LINE 服務邀請', '01-LINE服務邀請.png', 2400)

  await page.getByRole('button', { name: '開始轉電診斷' }).click()
  await page.getByRole('button', { name: '下一步：停車與充電' }).waitFor()
  await chapter('提供用車條件', '02-用車狀況.png')
  await page.getByRole('button', { name: '下一步：停車與充電' }).click()
  await page.getByRole('radio', { name: /公共充電/ }).check()
  await chapter('停車與充電', '03-停車與充電.png')
  await page.getByRole('button', { name: '下一步：行程需求' }).click()
  await chapter('通勤與長途需求', '04-行程需求.png')
  await page.getByRole('button', { name: '下一步：能源花費' }).click()
  await chapter('能源花費', '05-能源花費.png')
  await page.getByRole('button', { name: '建立我的轉電路徑' }).click()
  await page.getByRole('heading', { name: '現在可以轉電，先用公共充電跑順生活' }).waitFor()
  const familyId = page.url().split('/').pop()?.split('?')[0]
  await chapter('報告總覽：黃燈', '06-報告總覽.png', 2600)

  await page.getByRole('button', { name: '充電策略', exact: true }).click()
  await focusReportContent()
  await chapter('補電路徑', '07-充電策略.png', 1600)
  await page.getByRole('button', { name: '生活情境', exact: true }).click()
  await focusReportContent()
  await chapter('生活情境', '08-生活情境.png', 1500)
  await page.getByRole('button', { name: '成本區間', exact: true }).click()
  await focusReportContent()
  await chapter('成本區間', '09-成本區間.png', 1500)
  await page.getByRole('button', { name: '條件模擬', exact: true }).click()
  await focusReportContent()
  await chapter('假設家充可用', '10-假設模擬前.png')
  await page.getByRole('button', { name: '模擬家充可用' }).click()
  await page.getByRole('heading', { name: /模擬 v/ }).waitFor()
  await chapter('假設模擬結果', '11-假設模擬後.png', 2600)

  await page.goto(`${base}/advisor/reports/${familyId}?present=1`)
  await page.getByRole('heading', { name: '現在可以轉電，先用公共充電跑順生活' }).waitFor()
  await chapter('顧問查看同份報告', '12-顧問報告.png', 2200)
  await page.getByRole('checkbox', { name: '已確認住家充電實際可用' }).check()
  await chapter('顧問確認改善條件', '13-顧問確認條件.png')
  await page.getByRole('button', { name: '更新條件並重新評估' }).click()
  await page.getByRole('heading', { name: '家充成立，轉電路徑已完整' }).waitFor()
  await chapter('顧問查看新版報告', '14-顧問新版報告.png', 2600)

  await page.goto(`${base}/driver/report/${familyId}?present=1`)
  await page.getByRole('heading', { name: '家充成立，轉電路徑已完整' }).waitFor()
  await chapter('車主查看新版報告', '15-車主新版報告.png', 2200)
  await page.getByRole('button', { name: '回到 LINE 看摘要' }).click()
  await page.getByRole('heading', { name: '家充成立，轉電路徑已完整' }).waitFor()
  await chapter('LINE 查看新版摘要', '16-LINE新版摘要.png', 3000)

  await writeFile(resolve(output, '錄製章節.json'), JSON.stringify({
    source: 'fixture', resolution: '1280x720', elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)), familyId, chapters,
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}

// The temporary browser recording is renamed by the packaging step after capture.
