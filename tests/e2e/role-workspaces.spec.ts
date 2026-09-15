import { expect, test, Page } from "@playwright/test";
import { openApp } from "../helpers/auth";

const roles = ["sales_manager", "estimator"];
const densities = ["comfortable", "compact"];
const matrix = [[320,568],[360,640],[375,667],[390,844],[430,932],[720,840],[832,750],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080],[3840,2160]];
const jobs = [
  { id:901, title:"Смета первого объекта", status:"estimate_in_work", due_date:"2099-12-31" },
  { id:902, title:"Просроченная смета второго объекта", status:"estimate_new", due_date:"2020-01-01" },
  { id:903, title:"Сданная смета со старым сроком", status:"estimate_done", due_date:"2020-01-01" },
  { id:904, title:"Вопрос по составу работ", status:"estimate_question", due_date:"2099-12-31" },
  { id:905, title:"Приостановленная смета", status:"estimate_hold", due_date:null },
  { id:906, title:"Смета на доработке", status:"estimate_returned", due_date:null },
].map(job => ({ ...job, received_at:"2020-01-01", manager_name:"Менеджер QA", estimator_name:"Сметчик QA", customer_name:"Тестовый заказчик", files:[] }));

async function load(page:Page, role:string, density:string, route="/today") {
  await page.addInitScript(() => Reflect.deleteProperty(Navigator.prototype,"serviceWorker"));
  const users = await (await page.request.get("/api/users")).json();
  const manager = users.find((user:{role:string}) => user.role === "sales_manager");
  const projects = await (await page.request.get("/api/projects")).json();
  await page.route("**/api/projects", route => route.fulfill({json:projects.slice(0,3).map((project:object) => ({...project,sales_manager_id:manager.id}))}));
  await page.route("**/api/estimate-jobs", route => route.fulfill({json:jobs}));
  await page.goto("/today",{waitUntil:"networkidle"});
  await page.evaluate(({role,density}) => {
    localStorage.setItem("currentRole",role);
    localStorage.setItem("uiDensityMode",density);
  },{role,density});
  await openApp(page,route);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

async function metrics(page:Page) {
  return page.evaluate(() => {
    const shown = (node:HTMLElement) => !!(node.offsetWidth && node.offsetHeight && node.getClientRects().length);
    const clipped = [...document.querySelectorAll<HTMLElement>(".view.active button,.view.active summary")].filter(shown).filter(node => {
      const range=document.createRange(); range.selectNodeContents(node);
      const r=range.getBoundingClientRect(), b=node.getBoundingClientRect();
      return r.left<b.left-1 || r.right>b.right+1 || r.top<b.top-1 || r.bottom>b.bottom+1;
    }).map(node=>node.textContent?.trim().slice(0,70));
    return {overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth,clipped};
  });
}

for (const role of roles) for (const density of densities) {
  test(`${role} ${density}: estimate counters filter and mark actual rows`, async ({page}) => {
    await load(page,role,density,"/estimates");
    const rows=page.locator(".estimate-job-row");
    await expect(rows).toHaveCount(6);
    for(const [filter,ids] of [["active",[901,902,904]],["overdue",[902]],["done",[903]],["questions",[904]],["hold",[905]],["returned",[906]],["all",[901,902,903,904,905,906]]] as const) {
      const button=page.locator(`[data-estimate-job-filter="${filter}"]`);
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-pressed","true");
      await expect(button).toBeFocused();
      await expect(rows).toHaveCount(ids.length);
      expect(await rows.evaluateAll(nodes=>nodes.map(node=>Number((node as HTMLElement).dataset.estimateJob)))).toEqual([...ids]);
      await expect(page.locator('[data-estimate-job-filter="all"] strong')).toHaveText("6");
    }
    await expect(page.locator('[data-estimate-job="902"]')).toContainText("Просрочено");
    await expect(page.locator('[data-estimate-job="903"]')).not.toContainText("Просрочено");
    await expect(page.locator('[data-estimate-job="901"]')).toHaveAttribute("data-estimate-tone","active");
    const backgrounds=await rows.evaluateAll(nodes=>nodes.slice(0,3).map(node=>getComputedStyle(node).backgroundColor));
    expect(new Set(backgrounds).size).toBe(3);
  });

  test(`${role} ${density}: two decisions expand and object statuses stay readable`, async ({page}) => {
    await load(page,role,density);
    const list=page.locator("#todayAttention");
    await expect(list.locator(":scope > .decision-item")).toHaveCount(2);
    const disclosure=list.locator(".today-list-disclosure");
    const collapsed=(await list.boundingBox())!.height;
    await disclosure.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open","");
    expect((await list.boundingBox())!.height).toBeGreaterThan(collapsed);
    await disclosure.locator("summary").click();
    await expect(disclosure).not.toHaveAttribute("open","");
    if(role==="sales_manager") {
      for (const width of [320,390,832,1180,1440,1920]) {
        await page.setViewportSize({width,height:900});
        const cards=await page.locator(".today-object-card").evaluateAll(nodes=>nodes.map(node=>{
          const head=node.querySelector(".today-object-head")!;
          const status=head.querySelector(".pill")!;
          const toggle=node.querySelector(".today-object-toggle")!.getBoundingClientRect();
          const metrics=node.querySelector(".today-object-metrics")!.getBoundingClientRect();
          const range=document.createRange(); range.selectNodeContents(status);
          return {textHeight:range.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(status).lineHeight), toggleWidth:toggle.width,toggleHeight:toggle.height,metricsY:metrics.y,headBottom:head.getBoundingClientRect().bottom,height:node.getBoundingClientRect().height};
        }));
        for(const card of cards) {
          expect(card.textHeight).toBeLessThanOrEqual(card.lineHeight+2);
          expect(card.metricsY-card.headBottom).toBeGreaterThanOrEqual(8);
          expect(card.toggleWidth).toBeGreaterThanOrEqual(44);
          expect(card.toggleHeight).toBeGreaterThanOrEqual(44);
        }
        if(width>=1440) expect(Math.max(...cards.map(card=>card.height))-Math.min(...cards.map(card=>card.height))).toBeLessThanOrEqual(1);
      }
      await page.locator("[data-toggle-today-project]").first().click();
      await expect(page.locator(".today-object-details").first()).toBeVisible();
    }
  });
}

test("estimator material filters, spacing, matching panel headers and checks", async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await load(page,"estimator","comfortable","/materials");
  const panels=page.locator(".materials-layout > .panel");
  const a=(await panels.nth(0).boundingBox())!, b=(await panels.nth(1).boundingBox())!;
  expect(Math.abs(a.width-b.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.height-b.height)).toBeLessThanOrEqual(1);
  const heads=panels.locator(":scope > .panel-head");
  expect(Math.abs((await heads.nth(0).boundingBox())!.height-(await heads.nth(1).boundingBox())!.height)).toBeLessThanOrEqual(1);
  const filter=page.locator("#materialQuickFilterSelect");
  const gap=(await page.locator("#materialRows").boundingBox())!.y-((await filter.boundingBox())!.y+(await filter.boundingBox())!.height);
  expect(gap).toBeGreaterThanOrEqual(12);
  await filter.selectOption("urgent");
  await expect(filter).toHaveValue("urgent");
  await page.locator('[data-material-list-mode="archive"]').click();
  await expect(filter).toHaveValue("all");
  await page.locator('[data-material-list-mode="active"]').click();
  await expect(page.locator('[data-material-list-mode="active"]')).toHaveAttribute("aria-selected","true");
  await openApp(page,"/tasks");
  await expect(page.locator("#tasksView > .panel > .panel-head h2")).toHaveText("Проверки по смете");
  await expect(page.locator(".task-detail-panel h3")).toHaveText("Проверки объекта");
});

test("role workspaces: both densities, full matrix, resize and text stress", async ({page},info)=>{
  test.skip(info.project.name!=="desktop-chrome","Matrix runs once.");
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  const evidence:object[]=[];
  for(const role of roles) for(const density of densities) {
    for(const route of role==="estimator"?["/today","/estimates","/materials","/tasks"]:["/today","/estimates"]) {
      await load(page,role,density,route);
      for(const [width,height] of matrix) {
        await page.setViewportSize({width,height});
        const result=await metrics(page);
        expect(result,`${role} ${density} ${route} ${width}`).toEqual({overflow:0,clipped:[]});
        evidence.push({role,density,route,width,height,...result});
        if(density==="comfortable" && [320,832,1440].includes(width)) await page.screenshot({path:info.outputPath(`${role}-${route.slice(1)}-${width}.png`),fullPage:true});
      }
      const widths=[...new Set([...Array.from({length:101},(_,index)=>320+16*index),429,431,767,769,819,821,979,981,1099,1100,1101,1179,1180,1181,2560,3440,3840])];
      for(const width of widths) {
        await page.setViewportSize({width,height:900});
        expect(await metrics(page),`${role} ${density} ${route} resize ${width}`).toEqual({overflow:0,clipped:[]});
      }
      await page.setViewportSize({width:640,height:480});
      await page.locator(".view.active *").evaluateAll(nodes=>{
        const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));
        nodes.forEach((node,index)=>(node as HTMLElement).style.fontSize=`${sizes[index]*2}px`);
      });
      expect(await metrics(page),`${role} ${density} ${route} 200% text`).toEqual({overflow:0,clipped:[]});
    }
  }
  expect(errors).toEqual([]);
  await info.attach("role-matrix.json",{body:JSON.stringify({browser:page.context().browser()?.version(),evidence},null,2),contentType:"application/json"});
});
