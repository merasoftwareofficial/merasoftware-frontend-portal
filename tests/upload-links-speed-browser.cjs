const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const script = await build({
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'jsx', contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {BrowserRouter,Routes,Route,useNavigate} from 'react-router-dom';
      import Workspace from './src/pages/AdminClientWorkspace';
      import {setResourceIdentity} from './src/utils/resourceClient';
      setResourceIdentity({_id:'admin',role:'admin',roles:['admin']});
      const project=id=>({_id:'project-'+id,isWebsiteProject:true,projectSnapshot:{displayName:'Project '+id.toUpperCase()}});
      const row=(owner,n)=>({_id:owner+'-'+n,mode:'single',status:n===1?'active':'revoked',orderId:{projectSnapshot:{displayName:'Link '+owner.toUpperCase()+' '+n}},useCount:0});
      window.rows={a:Array.from({length:25},(_,i)=>row('a',i+1)),b:[row('b',1)]};
      window.calls=[];window.sources=[];window.pendingHistory=[];window.pendingGenerate=[];window.delayCustomer=null;window.delayGenerate=false;
      class Events{constructor(){this.closed=false;window.sources.push(this)}close(){this.closed=true}}
      window.EventSource=Events;
      window.emit=message=>window.sources.filter(source=>!source.closed).forEach(source=>source.onmessage?.({data:JSON.stringify(message)}));
      window.fetch=async (url,options={})=>{
        const parsed=new URL(url,location.origin),pathname=parsed.pathname;
        const method=String(options.method||'GET').toUpperCase();window.calls.push({url,method});let data=[];
        if(pathname.endsWith('/admin/user-workspace')){
          const id=parsed.searchParams.get('customerId');data={customer:{_id:id,name:'Client '+id.toUpperCase()},orders:[project(id)],invoices:[],transactions:[],summary:{}};
        }else if(pathname.includes('/clients/') && pathname.includes('/upload-links')){
          const id=pathname.split('/clients/')[1].split('/')[0];
          if(method==='GET'){
            const cursor=parsed.searchParams.get('cursor');const offset=cursor?window.rows[id].findIndex(row=>row._id===cursor)+1:0;
            const items=window.rows[id].slice(offset,offset+20);data={items:structuredClone(items),nextCursor:offset+20<window.rows[id].length?items[items.length-1]._id:null};
            if(window.delayCustomer===id)await new Promise(resolve=>window.pendingHistory.push({resolve,signal:options.signal}));
          }else if(pathname.endsWith('/revoke')){
            const linkId=pathname.split('/upload-links/')[1].split('/')[0];window.rows[id].find(row=>row._id===linkId).status='revoked';data={};
          }else{
            if(window.delayGenerate)await new Promise(resolve=>window.pendingGenerate.push(resolve));
            window.rows[id].filter(row=>row.status==='active').forEach(row=>row.status='replaced');
            window.rows[id].unshift({...row(id,'new'),status:'active'});data={publicUrl:'https://isolated.test/upload#fixture-'+id};
          }
        }
        return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
      };
      function App(){const navigate=useNavigate();return <><button onClick={()=>navigate('/admin-panel/clients/a?tab=upload-links')}>Client A</button><button onClick={()=>navigate('/admin-panel/clients/b?tab=upload-links')}>Client B</button><Routes><Route path='/admin-panel/clients/:customerId' element={<Workspace/>}/></Routes></>}
      createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
    ` }, bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.css': 'empty' },
    define: { 'process.env.REACT_APP_BACKEND_URL': '"http://fixture.test"', 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'fixture-shell', setup(builder) {
      builder.onResolve({ filter: /^react-redux$/ }, () => ({ path: 'redux', namespace: 'fixture' }));
      builder.onResolve({ filter: /\/(AdminLayout|App)$/ }, args => ({ path: args.path.endsWith('/App') ? 'app' : 'layout', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', contents: args.path === 'redux'
        ? "export const useSelector=f=>f({user:{user:{_id:'admin',role:'admin',roles:['admin']},initialized:true}});export const useDispatch=()=>()=>{};export const useStore=()=>({getState:()=>({})});"
        : args.path === 'app' ? 'export const useOnlineStatus=()=>({isOnline:true,isInitialized:true});' : 'export default function Layout({children}){return children}' }));
    } }],
  });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/app.js' ? script.outputFiles[0].text : '<div id="root"></div><script type="module" src="/app.js"></script>');
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/admin-panel/clients/a?tab=upload-links`);
    await page.getByText('Link A 20', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.getByText('Link A 25', { exact: true }).waitFor();
    await page.getByLabel('Project or service').selectOption('project-a');
    await page.getByLabel('Link usage').selectOption('multiple');
    const reads = () => page.evaluate(() => window.calls.filter(call => call.method === 'GET' && call.url.includes('/clients/a/upload-links')).length);
    const before = await reads();
    await page.evaluate(() => window.emit({ type: 'changed', resources: [{ domain: 'upload-links', ids: ['b'] }] }));
    await page.waitForTimeout(300); assert.equal(await reads(), before, 'unrelated customer does not refresh this list');
    await page.evaluate(() => {
      window.rows.a.unshift({_id:'external',mode:'single',status:'revoked',orderId:{projectSnapshot:{displayName:'External change'}}});
      for(let i=0;i<20;i++)window.emit({type:'changed',resources:[{domain:'upload-links',ids:['a']}]});
    });
    await page.getByText('External change', { exact: true }).waitFor();
    await page.getByText('Link A 25', { exact: true }).waitFor();
    assert.equal(await reads(), before + 2, 'one two-page reconciliation for an event burst');
    assert.equal(await page.getByLabel('Project or service').inputValue(), 'project-a');
    assert.equal(await page.getByLabel('Link usage').inputValue(), 'multiple');
    await page.getByRole('button', { name: 'Generate / Regenerate', exact: true }).click();
    await page.locator('input[readonly]').waitFor();
    assert.match(await page.locator('input[readonly]').inputValue(), /fixture-a$/);
    await page.getByText('Link A new', { exact: true }).waitFor();
    await page.getByText('Link A 25', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Revoke', exact: true }).first().click();
    await page.waitForFunction(() => window.rows.a.find(row => row._id === 'a-new').status === 'revoked');
    await page.getByRole('button', { name: 'Revoke', exact: true }).waitFor({ state: 'hidden' });
    await page.evaluate(() => { window.delayCustomer = 'a'; });
    await page.getByRole('button', { name: 'Refresh links', exact: true }).click();
    await page.waitForFunction(() => window.pendingHistory.length === 1);
    await page.getByRole('button', { name: 'Client B', exact: true }).click();
    await page.getByText('Link B 1', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.pendingHistory[0].signal.aborted), true);
    await page.evaluate(() => { window.delayCustomer = null; window.pendingHistory.splice(0).forEach(item => item.resolve()); });
    assert.equal(await page.getByText('Link A 25', { exact: true }).count(), 0);
    assert.equal(await page.locator('input[readonly]').count(), 0);
    await page.getByRole('button', { name: 'Client A', exact: true }).click();
    await page.getByLabel('Project or service').selectOption('project-a');
    await page.evaluate(() => { window.delayGenerate = true; });
    await page.getByRole('button', { name: 'Generate / Regenerate', exact: true }).click();
    await page.waitForFunction(() => window.pendingGenerate.length === 1);
    await page.getByRole('button', { name: 'Client B', exact: true }).click();
    await page.getByText('Link B 1', { exact: true }).waitFor();
    await page.evaluate(() => { window.delayGenerate = false; window.pendingGenerate.splice(0).forEach(resolve => resolve()); });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('input[readonly]').count(), 0, 'late generation cannot show another client link');
    assert.deepEqual(errors, []);
    console.log('PASS actual Upload Links: load-more, scoped live burst, loaded-window preservation, form selections, generate/revoke, client-switch abort and late mutation isolation.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
