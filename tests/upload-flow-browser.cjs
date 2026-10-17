const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const records = new Map();
  const script = await build({
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'jsx', contents: `
      import React, {useState, useEffect} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Provider} from 'react-redux';
      import {configureStore} from '@reduxjs/toolkit';
      import {UploadProvider, useUploads} from './src/context/UploadContext';
      const store = configureStore({reducer: (state = {user: {user: {_id: 'client-a'}}}, action) => action.type === 'switch' ? {user: {user: {_id: 'client-b'}}} : state});
      window.switchOwner = () => store.dispatch({type:'switch'});
      function Page() {
        const {startUpload, task} = useUploads();
        const [route, setRoute] = useState('form');
        useEffect(() => { window.uploadTask = task; }, [task]);
        const start = mode => {
          const formData = new FormData();
          formData.append('instructions','[]');
          formData.append('files', new File(['abc'], 'first.txt', {type:'text/plain'}));
          formData.append('files', new File(['def'], 'second.txt', {type:'text/plain'}));
          startUpload({url:'/submit/'+mode, progressUrl:'/progress/'+mode, formData, surface:'portal', label:'Test files', totalFiles:2, fileBytes:6, onSuccess:()=>{ window.completions=(window.completions||0)+1; }});
        };
        return <><h1>{route}</h1><button onClick={()=>{history.pushState(null,'','/other');setRoute('other page');}}>Navigate</button>
          {['success','drop','retry','owner'].map(mode=><button key={mode} onClick={()=>start(mode)}>{mode}</button>)}</>;
      }
      createRoot(document.getElementById('root')).render(<Provider store={store}><UploadProvider><Page/></UploadProvider></Provider>);
    ` },
    bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.REACT_APP_UPLOAD_TIMING_ENABLED': '"false"' },
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(script.outputFiles[0].text); return; }
    if (url.pathname.startsWith('/submit/')) {
      const mode = url.pathname.split('/')[2];
      const id = url.searchParams.get('uploadId');
      const prior = records.get(id);
      if (prior?.status === 'succeeded') {
        prior.attempts++;
        req.resume();
        req.on('end', () => json(prior.result));
        return;
      }
      const record = { mode, attempts: (prior?.attempts || 0) + 1, writes: 1, status: 'processing', completedFiles: 0 };
      records.set(id, record);
      req.resume();
      req.on('end', () => {
        const result = { success: true, data: {requestId:'saved-request'} };
        if (mode === 'drop') {
          record.status = 'succeeded'; record.result = result;
          res.destroy();
        } else if (mode === 'retry' && record.attempts === 1) {
          record.status = 'failed'; json({success:false,message:'Controlled Drive failure'},500);
        } else {
          record.completedFiles = 1;
          setTimeout(() => { record.status = 'succeeded'; record.completedFiles = 2; record.result = result; }, 1800);
          setTimeout(() => json(result), 2800);
        }
      });
      return;
    }
    if (url.pathname.startsWith('/progress/')) {
      const record = records.get(url.pathname.split('/').at(-1));
      if (!record) { json({success:false},404); return; }
      json({success:true,data:{status:record.status,phase:'saving_files',completedFiles:record.completedFiles,totalFiles:2,result:record.result}});
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: {width:390,height:844} });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    await page.getByRole('button',{name:'success',exact:true}).click();
    await page.waitForFunction(() => window.uploadTask?.percent === 100);
    await page.getByRole('button',{name:'Minimize',exact:true}).click();
    await page.getByRole('button',{name:'Navigate',exact:true}).click();
    await page.getByRole('heading',{name:'other page'}).waitFor();
    await page.getByRole('button',{name:'Expand',exact:true}).click();
    await page.waitForFunction(() => window.uploadTask?.completedFiles === 1);
    assert.equal(await page.locator('progress[value="100"]').count(),0,'No transfer progress shown as Drive completion');
    await page.waitForFunction(() => window.uploadTask?.status === 'complete');
    assert.equal(await page.evaluate(() => window.completions||0),0,'Do not run the old page callback after navigation');
    console.log('PASS: byte progress, real save count, minimize, navigation and single completion');
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();

    await page.getByRole('button',{name:'drop',exact:true}).click();
    await page.waitForFunction(() => window.uploadTask?.status === 'complete');
    const dropId = await page.evaluate(() => window.uploadTask.id);
    assert.equal(records.get(dropId).writes,1);
    console.log('PASS: lost response keeps one saved submission, including browser transport retries');
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();

    await page.getByRole('button',{name:'retry',exact:true}).click();
    await page.waitForFunction(() => window.uploadTask?.status === 'failed');
    const retryId = await page.evaluate(() => window.uploadTask.id);
    await page.getByRole('button',{name:'Retry same upload',exact:true}).click();
    await page.waitForFunction(() => window.uploadTask?.status === 'complete');
    assert.equal(await page.evaluate(() => window.uploadTask.id),retryId);
    assert.equal(records.get(retryId).attempts,2);
    console.log('PASS: explicit retry retains submission identity and file payload');
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();

    await page.getByRole('button',{name:'owner',exact:true}).click();
    await page.evaluate(() => window.switchOwner());
    await page.getByRole('region',{name:'Upload progress'}).waitFor({state:'hidden'});
    await page.waitForFunction(() => window.uploadTask?.status === 'complete');
    assert.equal(await page.evaluate(() => window.completions),2,'Previous account callback must not run after account changes');
    console.log('PASS: account switch hides previous upload and suppresses its callback');
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
