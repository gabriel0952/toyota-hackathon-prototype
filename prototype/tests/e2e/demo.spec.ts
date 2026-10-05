import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const shots = 'artifacts/screenshots'
test.beforeAll(async () => { await mkdir(shots, { recursive: true }) })

test('all route roots load offline', async ({ page, context }) => { await context.route(/https?:\/\/(?!127\.0\.0\.1).*/, (route) => route.abort()); for (const route of ['/line', '/driver', '/advisor']) { await page.goto(route); await expect(page.locator('body')).not.toBeEmpty(); await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll') } })
test('yellow walkthrough from LINE to customer booking', async ({ page }) => { await page.goto('/line?state=invite&present=1'); await page.screenshot({ path: `${shots}/01-line-invitation.png`, fullPage: true }); await page.getByRole('button', { name: '開始轉電診斷' }).click(); await expect(page).toHaveURL(/driver\/diagnostic/); await page.screenshot({ path: `${shots}/02-driver-diagnosis.png`, fullPage: true }); for (let i = 0; i < 4; i++) await page.getByRole('button', { name: i === 3 ? /建立我的轉電路徑/ : /下一步/ }).click(); await page.waitForURL(/driver\/report\/family-/); await expect(page.getByText('現在可以轉電，先用公共充電跑順生活')).toBeVisible(); await page.screenshot({ path: `${shots}/03-yellow-report.png`, fullPage: true }); await page.getByRole('button', { name: '充電策略' }).click(); await page.screenshot({ path: `${shots}/04-plan-abc.png`, fullPage: true }); await page.getByRole('button', { name: '總覽' }).click(); await page.getByRole('button', { name: /預約充電條件諮詢/ }).click(); await expect(page).toHaveURL(/driver\/booking\/report-/); await page.getByLabel('稱呼', { exact: true }).fill('測試車主'); await page.getByLabel('聯絡手機').fill('0912345678'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '確認示範預約' }).click(); await expect(page.getByText('已建立你的示範預約')).toBeVisible() })
test('what-if preserves original and creates v2', async ({ page }) => { await page.goto('/driver/report/report-main?scenario=yellow-public&tab=whatif&present=1'); await expect(page.getByText('目前 v1')).toBeVisible(); await page.getByRole('button', { name: /模擬家充可用/ }).click(); await expect(page.getByText('模擬 v2')).toBeVisible(); await page.screenshot({ path: `${shots}/05-what-if.png`, fullPage: true }) })
test('advisor confirmation and gray counterexample', async ({ page }) => { await page.goto('/advisor/reports/report-main?present=1'); await page.screenshot({ path: `${shots}/06-advisor-handoff.png`, fullPage: true }); await expect(page.getByRole('button', { name: '更新條件並重新評估' })).toBeDisabled(); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '更新條件並重新評估' }).click(); await expect(page.getByText('家充成立，轉電路徑已完整')).toBeVisible(); await page.getByRole('link', { name: '返回名單' }).click(); await expect(page.locator('.lead-row').filter({ hasText: '綠色｜條件成熟' }).first().getByText('綠色｜條件成熟')).toBeVisible(); await page.goto('/driver/report/report-gray?scenario=gray&present=1'); await expect(page.getByText('先不用急著換，等兩個條件改變再評估')).toBeVisible(); await expect(page.getByText(/bZ4X 適配/)).toHaveCount(0); await page.screenshot({ path: `${shots}/07-gray-counterexample.png`, fullPage: true }) })
test('mobile LINE to driver and presentation viewports', async ({ page, browserName }) => { await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/line?present=1'); await expect(page.locator('.phone')).toBeVisible(); await page.getByRole('button', { name: '開始轉電診斷' }).click(); await expect(page).toHaveURL(/driver\/diagnostic/); if (browserName === 'chromium') { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/driver/report/report-main?present=1'); await expect(page.locator('.decision')).toBeVisible() } })


test('questionnaire preserves edits and accepts invalid step links', async ({ page }) => {
  await page.goto('/driver/diagnostic?step=invalid&present=1')
  await page.getByRole('button', { name: /其他 手動輸入/ }).click()
  await page.getByLabel('目前車款', { exact: true }).fill('測試車款')
  await page.getByRole('button', { name: /下一步/ }).click()
  await page.locator('.simple-details summary').click()
  await page.getByRole('textbox', { name: '住家約略區域' }).fill('台北市松山區')
  await page.getByRole('radio', { name: /公司充電/ }).check()
  await page.reload()
  await page.locator('.simple-details summary').click()
  await expect(page.getByRole('textbox', { name: '住家約略區域' })).toHaveValue('台北市松山區')
  await expect(page.getByRole('radio', { name: /公司充電/ })).toBeChecked()
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await expect(page.getByLabel('目前車款', { exact: true })).toHaveValue('測試車款')
})

test('LINE opt out pauses invitation and can be restored', async ({ page }) => {
  await page.goto('/line?state=invite&present=1')
  await page.getByRole('button', { name: '先聊聊我的顧慮' }).click()
  await page.getByRole('button', { name: '長途續航', exact: true }).click()
  await expect(page.getByText('了解，我們會把最長行程和中途補電安排一起納入評估。')).toBeVisible()
  await page.getByRole('button', { name: '今天先不要', exact: true }).click()
  await expect(page.getByRole('button', { name: '開始轉電診斷' })).toHaveCount(0)
  await page.getByRole('button', { name: '停止未來的轉電邀請' }).click()
  await page.reload()
  await expect(page.getByText('已停止主動轉電邀請。保養與原廠服務通知不受影響。')).toBeVisible()
  await page.getByRole('button', { name: '重新開啟轉電邀請' }).click()
  await expect(page.getByRole('button', { name: '先聊聊我的顧慮' })).toBeVisible()
})

test('advisor filters, empty state, customer identity and notes', async ({ page }) => {
  await page.goto('/advisor?present=1')
  await page.getByLabel('搜尋服務名單').fill('林怡君')
  await expect(page.locator('.lead-row')).toHaveCount(1)
  await page.locator('.lead-row').click()
  await expect(page.getByRole('heading', { name: /林怡君/ })).toBeVisible()
  await page.getByLabel('新增紀錄').fill('下次確認試駕路線')
  await page.getByRole('button', { name: '儲存紀錄' }).click()
  await page.reload()
  await expect(page.getByText('下次確認試駕路線')).toBeVisible()
  await page.goto('/advisor')
  await page.getByLabel('搜尋服務名單').fill('不存在')
  await expect(page.locator('.lead-row')).toHaveCount(0)
  await page.getByLabel('搜尋服務名單').fill('')
  await expect(page.locator('.lead-row')).toHaveCount(5)
})

test('service pages fit the viewport', async ({ page }) => {
  for (const route of ['/driver', '/driver/diagnostic', '/driver/diagnostic?step=2', '/driver/diagnostic?step=3', '/driver/diagnostic?step=4', '/driver/report/report-main', '/driver/report/report-main?tab=charging', '/driver/report/report-main?tab=cost', '/driver/report/report-main?tab=whatif', '/line', '/advisor', '/advisor/reports/report-main', '/driver/booking/report-main']) {
    await page.goto(`${route}${route.includes('?') ? '&' : '?'}present=1`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true)
    await page.screenshot({ path: `${shots}/aligned-${page.viewportSize()?.width}-${route.replace(/[^a-z0-9]/gi, '-')}.png`, fullPage: true, animations: 'disabled' })
  }
})


test('short forms allow skipping optional context and preserve commute edits', async ({ page }) => {
  await page.goto('/driver/diagnostic?step=2&present=1')
  await expect(page.getByRole('textbox', { name: '住家約略區域' })).not.toBeVisible()
  await page.getByRole('radio', { name: /還不確定/ }).check()
  await page.getByRole('button', { name: '下一步：行程需求' }).click()
  await expect(page.getByRole('slider')).toHaveCount(0)
  await expect(page.getByRole('spinbutton').filter({visible:true})).toHaveCount(1)
  await page.getByRole('spinbutton', { name: '平日單程通勤', exact: true }).fill('25')
  await page.getByLabel('我沒有固定開車通勤').check()
  await expect(page.getByRole('spinbutton', {name:'平日單程通勤',exact:true})).toBeDisabled()
  await page.getByLabel('長途頻率').selectOption('幾乎沒有')
  await page.getByRole('button', { name: '下一步：能源花費' }).click()
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await page.getByLabel('我沒有固定開車通勤').uncheck()
  await expect(page.getByRole('spinbutton')).toHaveValue('25')
  await expect(page.getByLabel('長途頻率')).toHaveValue('幾乎沒有')
})

test('energy inputs validate on blur and allow unknown values', async ({ page }) => {
  await page.goto('/driver/diagnostic?step=4&present=1')
  await expect(page.getByRole('spinbutton')).toHaveCount(2)
  await expect(page.getByRole('slider')).toHaveCount(0)
  await expect(page.locator('.friendly-preview')).toHaveCount(0)
  const cost = page.getByRole('spinbutton', { name: '每月油資', exact: true })
  await cost.fill('-1')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await cost.blur()
  await expect(page.getByRole('button', { name: '建立我的轉電路徑' })).toBeDisabled()
  await expect(page.getByText('請輸入 0–30,000 元，或勾選下方選項略過。')).toBeVisible()
  await page.getByLabel('不確定油資，先略過').check()
  await page.getByLabel('不確定里程，先略過').check()
  await expect(page.getByRole('button', { name: '建立我的轉電路徑' })).toBeEnabled()
  await page.reload()
  await expect(page.getByLabel('不確定油資，先略過')).toBeChecked()
  await expect(cost).toBeDisabled()
  await page.getByRole('button', { name: '建立我的轉電路徑' }).click()
  await expect(page).toHaveURL(/driver\/(analysis|report)/)
})

test('short forms fit responsive widths and optional fields work with keyboard', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const step of [2, 3, 4]) {
      await page.goto(`/driver/diagnostic?step=${step}&present=1`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `${shots}/simplified-${width}-step-${step}.png`, fullPage: true })
    }
  }
  await page.goto('/driver/diagnostic?step=2&present=1')
  await page.locator('.simple-details summary').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: '住家約略區域' })).toBeVisible()
  await page.getByRole('textbox', { name: '住家約略區域' }).fill('')
  await expect(page.getByRole('button', { name: '下一步：行程需求' })).toBeEnabled()
})


test('legacy report can restore a session for editing', async ({page}) => {
  await page.goto('/driver/report/report-main')
  await page.getByRole('link',{name:'修改用車條件'}).click()
  await page.getByRole('button',{name:'下一步：停車與充電'}).click()
  await expect(page.getByRole('button',{name:'下一步：行程需求'})).toBeVisible()
})

test('questionnaire navigation remains in the same position across all four steps', async ({ page }) => {
  await page.goto('/driver/diagnostic?present=1')
  let previous: { x: number; y: number; width: number; height: number } | null = null
  for (let step = 1; step <= 4; step++) {
    const button = page.locator('.question-navigation .button')
    const rect = await button.boundingBox()
    expect(rect).not.toBeNull()
    if (previous && rect) {
      expect(Math.abs(rect.x - previous.x)).toBeLessThan(2)
      expect(Math.abs(rect.y - previous.y)).toBeLessThan(2)
    }
    previous = rect
    if (step > 1) {
      await page.locator('.simple-details').first().evaluate((element: HTMLDetailsElement) => { element.open = true })
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const expanded = await button.boundingBox()
      expect(Math.abs(expanded!.y - rect!.y)).toBeLessThan(2)
    }
    await button.click()
  }
  await page.waitForURL(/driver\/report\/family-/)
  await expect(page.locator('.report-summary')).toBeVisible()
})

test('cost comparison reveals one answer and keeps supporting details accessible', async ({ page }) => {
  await page.goto('/driver/report/report-main?tab=cost&present=1')
  await expect(page.locator('.cost-answer')).toContainText('151,873')
  await page.getByRole('button', { name: '相較繼續開現有車', exact: true }).click()
  await expect(page.locator('.cost-answer')).toContainText('768,854')
  await expect(page.locator('.cost-supporting')).toContainText('10 年內未交叉')
  await expect(page.locator('.tco-breakdown')).not.toBeVisible()
  await page.getByRole('button', { name: /五年費用明細/ }).click()
  await expect(page.locator('.tco-breakdown')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await expect(page.getByRole('link', { name: '修改成本條件' })).toBeVisible()
  const formula = page.getByRole('button', { name: '完整條件與公式' })
  await formula.click()
  await expect(page.getByRole('dialog', {name: '試算條件與計算方式'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(formula).toBeFocused()
  await page.getByRole('button', { name: '核對來源明細' }).click()
  await expect(page.getByRole('dialog', { name: '資料來源與使用限制' })).toBeVisible()
  await page.getByRole('button', { name: '關閉詳細資訊' }).click()
  await page.getByRole('button', { name: '查看歷史紀錄' }).click()
  await expect(page.getByRole('dialog', { name: '歷史報告版本' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '同意分享給示範顧問' })).toBeVisible()
})

test('common vehicle quick pick prefills fuel data and a clearable trade-in estimate', async ({ page }) => {
  await page.goto('/driver/diagnostic?present=1')
  await page.getByLabel('車齡（出廠至今）').fill('6')
  await page.getByLabel(/常見車型快速帶入/).selectOption('CAMRY')
  await expect(page.getByLabel('目前車款', { exact: true })).toHaveValue('Camry 2.0')
  await page.goto('/driver/diagnostic?step=4&present=1')
  await page.locator('.tco-details summary').click()
  await expect(page.getByRole('spinbutton', { name: '現有車平均油耗' })).toHaveValue('12')
  const tradeIn = page.getByRole('spinbutton', { name: '現有車預估換購價' })
  await expect(tradeIn).toHaveValue('313000')
  await tradeIn.fill('')
  await expect(tradeIn).toHaveValue('')
  await page.getByRole('button', { name: /帶入估算值 NT\$ 313,000/ }).click()
  await expect(tradeIn).toHaveValue('313000')
  await expect(page.getByLabel(/如果不換電動車/).locator('option')).toHaveText(['尚未決定', 'RAV4 2.0', 'COROLLA CROSS 1.8', 'CAMRY 2.0', 'RAV4 HYBRID'])
})

test('every report offers the condition simulation; gray explains what home charging alone cannot fix', async ({ page }) => {
  await page.goto('/driver/report/report-gray?tab=whatif&present=1')
  await expect(page.getByRole('button', { name: '條件模擬', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /模擬家充可用/ }).click()
  await expect(page.getByRole('heading', { name: '模擬 v2' })).toBeVisible()
  await expect(page.locator('.whatif-verdict')).toContainText('只有家充還不夠')
  await page.getByRole('button', { name: '充電策略', exact: true }).click()
  await expect(page.locator('.plans')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '目前還沒有可確認的補電方案' })).toBeVisible()
  await page.goto('/driver/report/report-main?tab=whatif&present=1')
  await page.getByRole('button', { name: /模擬家充可用/ }).click()
  await expect(page.locator('.whatif-verdict')).toContainText('從黃燈變成綠燈')
})

test('charging tab separates missing data from no nearby station', async ({ page }) => {
  await page.goto('/driver/report/report-pending?tab=charging&present=1')
  await expect(page.locator('.charging-data-status')).toContainText('這不代表附近沒有充電站')
  await page.goto('/driver/report/report-main?tab=charging&present=1')
  await expect(page.locator('.charging-data-status')).toHaveCount(0)
})
