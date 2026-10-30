const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const script = await build({ bundle: true, write: false, jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.REACT_APP_BACKEND_URL': '"http://node.test"', 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'layout-fixture', setup(b) {
      b.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path, { paths: [path.resolve(__dirname, '..')] }) }));
      b.onResolve({ filter: /components\/AdminLayout$|react-redux$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'react-redux' ? 'export const useSelector=f=>f({user:{user:{name:"Admin"}}});' : 'export default function Layout({children}){return children}', loader: 'js' }));
    } }],
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'jsx', contents: `
      import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      window.calls=[];window.failSave=true;
      let settings={name:'Admin',loginEmail:'admin@example.test',contactEmail:'',whatsappNumbers:[],countries:[{code:'+91',label:'India',digits:10},{code:'+1',label:'USA / Canada',digits:10}]};
      window.fetch=async(url,options={})=>{
        window.calls.push({url:String(url),method:options.method,body:options.body});
        const json=data=>new Response(JSON.stringify({success:true,...data}),{headers:{'content-type':'application/json'}});
        if(String(url).includes('my-settings')||String(url).includes('admin-contact-settings')){
          if(options.method==='PATCH')settings={...settings,...JSON.parse(options.body)};
          return json({data:settings});
        }
        if(String(url).endsWith('/api/node')){
          if(window.failSave)return new Response(JSON.stringify({success:false}),{status:400,headers:{'content-type':'application/json'}});
          return json({emailStatus:'awaiting-review',emailDraftIds:['node-draft']});
        }
        if(String(url).endsWith('/drafts/node-draft'))return json({data:{_id:'node-draft',event:'sendProjectUpdateEmail',status:'pending',to:['ravi@example.test'],subject:'Project update',text:'Hello Ravi. Progress 35.5%',html:'<p>Hello Ravi. Progress 35.5%</p>',defaultChannel:'email',channelOptions:[{id:'email',label:'Email',enabled:true}]}});
        return json({data:{status:'skipped'}});
      };
      require('./src/helpers/emailReview');
      const Dialog=require('./src/components/EmailReviewDialog').default;
      const Node=require('./src/components/admin/AdminProjectCheckpointDetail').default;
      const Settings=require('./src/pages/AdminSettingsPage').default;
      const NextSettings=require('../merasoftware/src/app/admin/settings/admin-contact-settings').default;
      function App(){const[busy,setBusy]=useState(false);const[progress,setProgress]=useState(20);window.complete=()=>setProgress(100);return <><Node updateMode currentProjectProgress={progress} latestNodeId="complete-node" isSubmitting={busy} onAddNode={async()=>{setBusy(true);try{return(await fetch('http://node.test/api/node',{method:'POST'})).ok}finally{setBusy(false)}}}/><Dialog/>{location.search.includes('next')?<NextSettings/>:<Settings/>}</>}
      createRoot(document.getElementById('root')).render(<App/>);
    ` } });
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/app.js' ? script.outputFiles[0].text : '<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script src="/app.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    for (const suffix of ['', '?next']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/${suffix}`);
      await page.getByLabel('Node title').fill('Design ready'); await page.getByLabel('New progress %').fill('35.5');
      assert.equal(await page.getByRole('button', { name: 'Add Node', exact: true }).count(), 1);
      assert.equal(await page.getByText('Message template', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Add Node', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('input[type=number]')?.disabled === false);
      assert.equal(await page.getByLabel('Node title').inputValue(), 'Design ready');
      await page.evaluate(() => { window.failSave = false; });
      await page.getByRole('button', { name: 'Add Node', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: /Don't Send|Don’t Send/ }).click();
      await page.waitForFunction(() => document.querySelector('input[type=number]')?.value === '');
      await page.getByLabel('Contact email', { exact: true }).fill('contact@example.test');
      await page.getByRole('button', { name: 'Add WhatsApp number' }).click();
      await page.getByLabel('WhatsApp number 1', { exact: true }).fill('9876543210');
      await page.getByRole('button', { name: 'Add WhatsApp number' }).click();
      await page.getByLabel('Country code 2', { exact: true }).selectOption('+1');
      await page.getByLabel('WhatsApp number 2', { exact: true }).fill('4155552671');
      assert.equal(await page.getByRole('button', { name: 'Add WhatsApp number' }).count(), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await page.waitForFunction(() => window.calls.some(row => row.method === 'PATCH'));
      const saved = await page.evaluate(() => JSON.parse(window.calls.find(row => row.method === 'PATCH').body));
      assert.deepEqual(saved.whatsappNumbers, ['+919876543210', '+14155552671']);
      assert.equal(saved.contactEmail, 'contact@example.test');
      await page.evaluate(() => window.complete());
      await page.getByText('Project complete — 100%').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Add Node', exact: true }).count(), 0);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: single node button, failed-save preservation, existing review popup, and React/Next admin contact forms with country codes at mobile viewport.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
