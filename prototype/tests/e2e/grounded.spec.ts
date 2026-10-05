import { test, expect } from '@playwright/test'

test('a completed evaluation remains visible when the follow-up report read fails', async ({page}) => {
  await page.goto('/driver')
  await page.getByRole('button',{name:/開始轉電診斷/}).click()
  await page.getByRole('button',{name:/下一步：停車/}).click()
  await page.getByRole('button',{name:/下一步：行程/}).click()
  await page.getByRole('button',{name:/下一步：能源/}).click()
  await page.route('**/api/v1/report-families/*/latest?role=driver', route => route.abort())
  await page.getByRole('button',{name:/建立我的轉電路徑/}).click()
  await expect(page).toHaveURL(/report\/family-/)
  await expect(page.getByRole('heading',{name:'我的轉電報告'})).toBeVisible()
  await expect(page.locator('.decision')).toBeVisible()
  await expect(page.getByRole('status').filter({hasText:'正在顯示已完成的報告'})).toBeVisible()
  await expect(page.getByText('正在整理你的轉電路徑')).toHaveCount(0)
})

test('real TDX cache and zero-paid template: questionnaire, evidence, three channels and immutable history', async ({page,browser}) => {
  const health=await (await page.request.get('/api/v1/health')).json()
  expect(health.contractVersion).toBe('0.3')
  await page.goto('/driver')
  await page.getByRole('button',{name:/開始轉電診斷/}).click()
  await page.getByRole('button',{name:/下一步：停車/}).click()
  await page.locator('summary').filter({hasText:'補充停車'}).click()
  await page.getByLabel('住家充電是否已可使用').selectOption('available')
  await page.getByLabel('公司充電是否已可使用').selectOption('unavailable')
  await page.getByLabel('住家安裝評估').selectOption('failed')
  await page.getByLabel('可使用公共充電的時段').selectOption('day')
  await page.getByLabel('住家約略區域').fill('台北市內湖區')
  await page.getByRole('button',{name:/下一步：行程/}).click()
  await page.getByLabel('長途頻率').selectOption('幾乎沒有')
  await page.getByRole('button',{name:/下一步：能源/}).click()
  await page.getByRole('button',{name:/建立我的轉電路徑/}).click()
  await expect(page).toHaveURL(/report\/family-/)
  await expect(page.locator('.decision')).toContainText('主要補電與通勤條件')
  const family=new URL(page.url()).pathname.split('/').pop()!
  const api=page.request
  const original=await (await api.get(`/api/v1/report-families/${family}/latest`)).json()
  expect(original.contractVersion).toBe('0.3')
  expect(original.generationMode).toBe(process.env.EXPECT_GENERATION_MODE || 'template')
  expect(original.sources.some((s:{sourceKind:string})=>s.sourceKind==='tdx')).toBe(true)
  expect(original).not.toHaveProperty('_agentTrace')
  await page.locator('.report-provenance .source-details summary').click()
  await expect(page.locator('.report-provenance .source-details')).toContainText(process.env.EXPECT_GENERATION_MODE === 'llm' ? 'AI' : '規則與模板整理')
  await page.screenshot({path:'artifacts/screenshots/grounded-driver.png',fullPage:true})
  await page.getByRole('button',{name:'充電策略',exact:true}).click()
  await expect(page.locator('.plans')).toContainText('新湖國民小學')
  await expect(page.locator('.charging-grid')).not.toContainText('依種子資料計算')
  await page.screenshot({path:'artifacts/screenshots/grounded-candidates.png',fullPage:true})
  await page.getByRole('button',{name:'同意分享給示範顧問',exact:true}).click()
  const advisorContext=await browser.newContext(),advisor=await advisorContext.newPage()
  await advisor.goto('/advisor')
  await advisor.getByRole('button',{name:'登入本機展示顧問'}).click()
  await advisor.goto(`/advisor/reports/${family}`)
  await expect(advisor.locator('.decision')).toContainText(original.headline)
  await advisor.locator('.source-details summary').click()
  await advisor.screenshot({path:'artifacts/screenshots/grounded-advisor.png',fullPage:true})
  await page.goto(`/line/result/${family}`)
  await expect(page.locator('.line-result-card')).toContainText(original.headline)
  await page.locator('.source-details summary').click()
  await page.screenshot({path:'artifacts/screenshots/grounded-line.png',fullPage:true})
  const simulated=await (await api.post(`/api/v1/reports/${original.id}/simulate`,{data:{type:'home-charger-approved',value:false},headers:{'Idempotency-Key':`sim-${family}`}})).json()
  expect(simulated.kind).toBe('simulation')
  expect((await (await api.get(`/api/v1/report-families/${family}/latest`)).json()).id).toBe(original.id)
  const latest=await (await api.post(`/api/v1/report-families/${family}/condition-updates`,{data:{expectedRevision:original.inputRevision,fields:{distance:{value:25,status:'provided',source:'user',updatedAt:new Date().toISOString()}}},headers:{'Idempotency-Key':`update-${family}`}})).json()
  expect(latest.version).toBe(3)
  expect(await (await api.get(`/api/v1/reports/${original.id}`)).json()).toEqual(original)
  await api.delete(`/api/v1/report-families/${family}/share`)
  await expect(advisor.getByRole('alert')).toContainText('分享授權',{timeout:12000})
  await advisorContext.close()
})

// Inject browser-boundary faults; server semantics are covered by TestClient.
import { readFileSync } from 'node:fs'
const examples = JSON.parse(readFileSync(new URL('../../docs/examples-v0.3.json', import.meta.url), 'utf8'))
for (const freshness of ['stale', 'unknown'] as const) {
  test(`source ${freshness}, partial coverage and template fallback remain explicit`, async ({page}) => {
    const report=structuredClone(examples.driverResponse)
    report.sources=report.sources.map((s: { sourceKind: string })=>s.sourceKind==='tdx'?{...s,freshness,coverage:'partial'}:s)
    await page.route('**/api/v1/**',async route=>{
      const path=new URL(route.request().url()).pathname
      const data=path.endsWith('/evaluation-state')?{inputRevision:2,evaluatedRevision:1,pending:true}:path.endsWith('/versions')?[report]:report
      await route.fulfill({status:200,json:data})
    })
    await page.goto(`/driver/report/${report.reportFamilyId}`)
    await expect(page.locator('.decision')).toContainText(report.headline)
    await page.locator('.report-provenance .source-details summary').click()
    await expect(page.locator('.report-provenance .source-details')).toContainText(freshness==='stale'?'資料已過期':'來源更新時間未確認')
    await expect(page.locator('.report-provenance .source-details')).toContainText('部分範圍')
    await expect(page.locator('.report-provenance .source-details')).toContainText('規則與模板整理')
    await expect(page.getByRole('status').filter({hasText:'目前保留舊報告'})).toBeVisible()
    await page.getByRole('button',{name:'充電策略',exact:true}).click()
    await expect(page.locator('.charging-grid')).not.toContainText('依種子資料計算')
    await expect(page.locator('.map-graphic')).toHaveCount(0)
  })
}
test('tool failure preserves original report without a canned simulation',async({page})=>{
  const report=examples.driverResponse
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path.endsWith('/simulate'))return route.fulfill({status:503,json:{detail:{code:'source_failed',message:'來源暫時無法使用，請重試'}}})
    const data=path.endsWith('/evaluation-state')?{inputRevision:1,evaluatedRevision:1,pending:false}:path.endsWith('/versions')?[report]:report
    await route.fulfill({status:200,json:data})
  })
  await page.goto(`/driver/report/${report.reportFamilyId}`)
  await page.getByRole('button',{name:'條件模擬',exact:true}).click()
  await page.getByRole('button',{name:/模擬家充可用/}).click()
  await expect(page.getByRole('alert').filter({hasText:'來源暫時無法使用'})).toBeVisible()
  await expect(page.locator('.decision')).toContainText(report.headline)
  await expect(page.getByText('模擬 v2')).toHaveCount(0)
})
test('public view rejects a response containing private trace fields',async({page})=>{
  await page.route('**/api/v1/**',route=>route.fulfill({status:200,json:{...examples.driverResponse,_agentTrace:{privateNotes:'PRIVATE_SENTINEL'}}}))
  await page.goto(`/driver/report/${examples.driverResponse.reportFamilyId}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.decision')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('PRIVATE_SENTINEL')
})

for (const width of [375, 768, 1280]) {
  test(`report tabs fit ${width}px with complete and empty data`, async ({page}) => {
    await page.setViewportSize({width,height:900})
    await page.emulateMedia({reducedMotion:'reduce'})
    let empty = false
    const full = structuredClone(examples.driverResponse)
    await page.route('**/api/v1/**', async route => {
      const report = empty ? {...full, plans:[], journeys:[]} : full
      const path = new URL(route.request().url()).pathname
      const data = path.endsWith('/evaluation-state') ? {inputRevision:1,evaluatedRevision:1,pending:false}
        : path.endsWith('/versions') ? [report]
        : path.endsWith('/simulate') ? {...report,id:'report-layout-simulation',version:2,kind:'simulation',basedOnReportId:report.id} : report
      await route.fulfill({status:200,json:data})
    })
    await page.goto(`/driver/report/${full.id}`)
    for (const [id,label] of [['overview','總覽'],['charging','充電策略'],['journey','生活情境'],['cost','成本分析'],['whatif','條件模擬']]) {
      await page.getByRole('button',{name:label,exact:true}).click()
      await expect(page.getByRole('region',{name:label,exact:true})).toBeVisible()
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('.report-tab-content')!.getBoundingClientRect()
        const controls = document.querySelector('.report-controls')!.getBoundingClientRect()
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,gap:controls.top-panel.bottom,
          outside:[...document.querySelectorAll('.report-tab-content .card')].some(el=>{const r=el.getBoundingClientRect();return r.left<panel.left-1||r.right>panel.right+1})}
      })
      expect(layout.overflow).toBe(false)
      expect(layout.outside).toBe(false)
      expect(layout.gap).toBeGreaterThanOrEqual(24)
      if (id==='whatif') {
        await page.getByRole('button',{name:'模擬家充可用',exact:true}).click()
        await expect(page.getByRole('heading',{name:'模擬 v2'})).toBeVisible()
      }
      await page.locator('.report-tab-content').screenshot({path:`artifacts/screenshots/report-${width}-${id}.png`})
    }
    empty = true
    await page.reload()
    await page.getByRole('button',{name:'充電策略',exact:true}).click()
    await expect(page.getByRole('heading',{name:'目前還沒有可確認的補電方案'})).toBeVisible()
    await page.getByRole('button',{name:'生活情境',exact:true}).click()
    await expect(page.getByRole('heading',{name:'尚待補充行程資訊'})).toBeVisible()
  })
}
