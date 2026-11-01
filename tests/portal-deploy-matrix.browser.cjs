// Actual production routes; local API/SSE fixtures only. Never contacts production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('../../merasoftware/node_modules/playwright');
const build = path.resolve(__dirname, '../build');
const evidence = process.env.PORTAL_MATRIX_EVIDENCE || path.join(require('node:os').tmpdir(), 'portal-deploy-matrix');
fs.mkdirSync(evidence, {recursive:true});
const server=http.createServer((req,res)=>{
 let file=path.resolve(build,'.'+new URL(req.url,'http://local').pathname);
 if(!file.startsWith(build+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(build,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
const routes=[
 ['admin','/admin-panel/dashboard','/api/admin/dashboard-summary'],
 ['admin','/admin-panel/clients','/api/admin/clients'],
 ['admin','/admin-panel/website-management/plans','/api/admin/plan-catalogue'],
 ['admin','/admin-panel/project-setup/base-price','/api/admin/category-base-prices'],
 ['admin','/admin-panel/project-setup/features','/api/admin/feature-products'],
 ['admin','/admin-panel/trash','/api/admin/trash'],
 ['admin','/admin-panel/money-management','/api/admin/settings'],
 ['admin','/admin-panel/settings','/api/admin/my-settings'],
 ['customer','/dashboard','/api/get-order'],
 ['customer','/order','/api/get-order'],
 ['customer','/my-invoices','/api/my-invoices'],
 ['customer','/support','/api/get-user-tickets'],
 ['customer','/support-tickets/T-001','/api/get-ticket-details/T-001'],
 ['customer','/invoice-detail/invoice-1','/api/my-invoices'],
 ['customer','/my-referred-leads','/api/my-referred-leads'],
 ['customer','/start-new-project/services','/api/customer/service-plan-catalogue'],
 ['customer','/settings','/api/user-details'],
 ['customer','/wallet','/api/wallet/history'],
 ['customer','/documents','/api/my-documents']
];
let browser; const results=[];
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 for(const width of [375,1440]) for(const [role,routeName,endpoint] of routes.filter(x=>!process.env.MATRIX_ROUTE||x[1]===process.env.MATRIX_ROUTE)){
  const context=await browser.newContext({viewport:{width,height:950}});
  let fail=false;const requests=[];const errors=[];
  const user={_id:'fixture-'+role,name:'Verification '+role,email:'fixture@example.test',phone:'9999999999',age:30,role,roles:[role],activeRole:role,walletBalance:50,isGuest:false};
  await context.addInitScript(()=>{
   window.__feeds=[];
   window.EventSource=class {constructor(){window.__feeds.push(this);setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'ready'})}),20)}close(){this.closed=true}};
   window.__disconnect=()=>window.__feeds.filter(x=>!x.closed).forEach(x=>x.onerror?.());
   window.__reconcile=()=>window.__feeds.filter(x=>!x.closed).forEach(x=>x.onmessage?.({data:JSON.stringify({type:'resync'})}));
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()==='PATCH'&&url.pathname==='/api/admin/plan-catalogue/quote')return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture price preview only'})});
   assert.equal(req.method(),'GET','verification must not mutate: '+url.pathname);
   requests.push({path:url.pathname,at:Date.now()});
   if(fail&&url.pathname===endpoint&&endpoint!='/api/user-details')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture temporary read failure'})});
   let data=[];
   if(url.pathname==='/api/user-details')data=user;
   else if(url.pathname==='/api/admin/dashboard-summary')data={active:0,inactive:0,joinedThisMonth:0,recentClients:[]};
   else if(url.pathname.endsWith('/plan-catalogue')||url.pathname.endsWith('/service-plan-catalogue'))data={plans:[],categories:[],products:[]};
   else if(url.pathname.startsWith('/api/get-ticket-details/'))data={ticketId:'T-001',status:'open',subject:'Fixture support',description:'Local verification',category:'general',createdAt:'2026-10-26T06:00:00Z',messages:[],userId:user};
   else if(url.pathname==='/api/my-invoices')data=[{_id:'invoice-1',invoiceNumber:'INV-001',status:'paid',amount:100,amountPaid:100,invoiceDate:'2026-10-26',dueDate:'2026-11-26',orderId:{_id:'order-1',productId:{serviceName:'Fixture project'}}}];
   else if(url.pathname==='/api/get-user-tickets')data={tickets:[],pagination:{pages:1,total:0,page:1}};
   else if(url.pathname==='/api/my-documents')data={documents:[]};
   else if(url.pathname==='/api/admin/my-settings')data={name:user.name,loginEmail:user.email,contactEmail:user.email,whatsappNumbers:[],countries:[]};
   else if(url.pathname==='/api/admin/settings')data={leadReferralRewardAmount:100};
   else if(url.pathname==='/api/wallet/balance')data={balance:50};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const start=Date.now();await page.goto(origin+routeName);
  await page.waitForFunction(()=>!!document.querySelector('h1,h2'));
  await page.waitForTimeout(600);
  assert(!await page.getByText('Unexpected Application Error!',{exact:true}).count(),routeName+' crashed');
  assert(!await page.getByText('Unauthorized Access',{exact:true}).count(),routeName+' denied');
  assert(requests.some(x=>x.path===endpoint),routeName+' did not read '+endpoint+'; actual '+requests.map(x=>x.path));
  const cold=Date.now()-start;
  if(routeName==='/admin-panel/website-management/plans'){
   await page.getByRole('button',{name:'New plan +',exact:true}).click();
   await page.getByLabel('Plan name',{exact:true}).fill('Unsaved plan draft');
  }
  // Errors during a refresh must not unmount the route; reconciliation can recover.
  if(endpoint!='/api/user-details'){
   fail=true;await page.evaluate(()=>window.__reconcile());await page.waitForTimeout(450);
   if(routeName==='/admin-panel/website-management/plans')assert.equal(await page.getByLabel('Plan name',{exact:true}).count(),1,'background error destroyed plan editor draft');
   fail=false;const before=requests.length;await page.evaluate(()=>window.__reconcile());await page.waitForTimeout(500);
   assert(requests.slice(before).some(x=>x.path===endpoint),routeName+' did not reconcile after failed read');
  }
  if(routeName==='/settings'||routeName==='/admin-panel/settings'){
   const handle=await page.evaluateHandle(expected=>[...document.querySelectorAll('input')].find(x=>x.value===expected),user.name);
   assert(await handle.asElement(),'profile name input missing');
   await handle.asElement().fill('Unsaved verification draft');
   await page.evaluate(()=>window.__reconcile());await page.waitForTimeout(500);
   assert.equal(await handle.asElement().inputValue(),'Unsaved verification draft','live update overwrote draft');
   user._id+='-second';user.name='Second account';
   await page.evaluate(()=>window.dispatchEvent(new Event('portal-session-check')));
   await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(x=>x.value==='Second account'));
   assert(!await page.locator('input').evaluateAll(xs=>xs.some(x=>x.value==='Unsaved verification draft')),'old account draft leaked');
  }
  await page.evaluate(()=>{window.__disconnect();window.dispatchEvent(new Event('offline'));});
  await page.waitForTimeout(100);
  const beforeOnline=requests.length;
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(500);
  assert(requests.slice(beforeOnline).some(x=>x.path===endpoint),routeName+' failed online recovery');
  if(routeName==='/admin-panel/website-management/plans'){
   assert.equal(await page.getByLabel('Plan name',{exact:true}).inputValue(),'Unsaved plan draft');
   await page.getByLabel('Plan name',{exact:true}).fill('');
  }
  await page.reload();await page.waitForTimeout(650);
  assert.equal(new URL(page.url()).pathname,routeName,'deep-link reload changed route');
  assert.deepEqual(errors,[],routeName);
  const bytes=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((n,e)=>n+(e.encodedBodySize||0),0));
  const result={route:routeName,role,width,coldFixtureMs:cold,fixtureReadCount:requests.length,encodedResourceBytes:bytes};results.push(result);
  await page.screenshot({path:path.join(evidence,role+'-'+routeName.replaceAll('/','_')+'-'+width+'.png'),fullPage:true});
  await context.close();console.log('PASS '+role+' '+routeName+' '+width+' cold/reload/error/reconcile');
 }
 fs.writeFileSync(path.join(evidence,'matrix.json'),JSON.stringify(results,null,2));
 console.log('PASS '+results.length+' route/viewport combinations. Local fixture timing and bytes only.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
