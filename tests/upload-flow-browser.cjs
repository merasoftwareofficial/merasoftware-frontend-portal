const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const records = new Map();
  const capabilityReads = new Map();
  let stagedEnabled = true;
  let legacyWrites = 0;
  const cssManifest = require('../build/asset-manifest.json');
  const css = fs.readFileSync(path.join(__dirname, '../build', cssManifest.files['main.css']), 'utf8');
  // Only bundle the focused test harness. This does not run the application build.
  const script = await build({
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'jsx', contents: `
      import React, {useState, useEffect} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Provider} from 'react-redux';
      import {configureStore} from '@reduxjs/toolkit';
      import {UploadProvider, useUploads} from './src/context/UploadContext';
      import UpdateRequestModal from './src/components/UpdateRequestModal';
      import {PageTransition} from './src/components/PageMotion';
      import {ThemeProvider} from './src/context/ThemeContext';
      const store = configureStore({reducer: (state = {user: {user: {_id: 'client-a'}}}, action) => action.type === 'switch' ? {user: {user: {_id: 'client-b'}}} : state});
      window.switchOwner = () => store.dispatch({type:'switch'});
      function Page() {
        const {startUpload, task} = useUploads();
        const [open,setOpen] = useState(false);
        const [route,setRoute] = useState('form');
        useEffect(() => {
          window.uploadTask = task;
          if (task) (window.samples ||= []).push(JSON.parse(JSON.stringify(task)));
        }, [task]);
        const start = mode => {
          const formData = new FormData();
          formData.append('instructions','[]');
          formData.append('files', new File([new Uint8Array(128*1024)], 'first.txt', {type:'text/plain'}));
          formData.append('files', new File([new Uint8Array(64*1024)], 'second.txt', {type:'text/plain'}));
          startUpload({url:'/legacy/'+mode,progressUrl:'/progress/'+mode,sessionUrl:'/sessions/'+mode,formData,surface:'portal',label:'Test files',totalFiles:2,fileBytes:192*1024,onSuccess:()=>{window.completions=(window.completions||0)+1;}});
        };
        return <><h1>{route}</h1><button onClick={()=>{history.pushState(null,'','/other');setRoute('other page');}}>Navigate</button>
          <button onClick={()=>setOpen(true)}>Open upload modal</button>
          {['success','drop','retry','owner','legacy','older','caperror','beginlost','offline'].map(mode=><button key={mode} onClick={()=>start(mode)}>{mode}</button>)}
          <PageTransition pageKey="upload"><div style={{minHeight:1800}}>
          {open && <UpdateRequestModal plan={{_id:'project-a',isWebsiteProject:true}} onClose={()=>setOpen(false)}/>}
          </div></PageTransition></>;
      }
      createRoot(document.getElementById('root')).render(<Provider store={store}><ThemeProvider><UploadProvider><Page/></UploadProvider></ThemeProvider></Provider>);
    ` },
    bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.REACT_APP_UPLOAD_TIMING_ENABLED': '"false"', 'process.env.REACT_APP_BACKEND_URL': '""' },
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (body, status = 200) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(body)); };
    const status = record => ({success:true,data:{status:record.status,files:record.files,result:record.result}});
    if (url.pathname === '/app.js') {res.setHeader('content-type','text/javascript');res.end(script.outputFiles[0].text);return;}
    if (url.pathname === '/app.css') {res.setHeader('content-type','text/css');res.end(css);return;}
    if (url.pathname.startsWith('/legacy/')) {
      const mode = url.pathname.split('/')[2], id = url.searchParams.get('uploadId');
      const prior = records.get(id);
      req.resume(); req.on('end',()=>{
        if (prior?.status === 'succeeded') { json(prior.result); return; }
        legacyWrites++;
        const record = {mode,status:'processing',completedFiles:0};
        records.set(id,record);
        // Server saves files to Drive one by one after the request body has arrived.
        setTimeout(()=>{record.completedFiles=1;},300);
        setTimeout(()=>{record.status='succeeded';record.completedFiles=2;record.result={success:true,data:{requestId:'legacy-request'}};json(record.result);},2500);
      });return;
    }
    if (url.pathname.startsWith('/progress/')) {
      const record = records.get(url.pathname.split('/').at(-1));
      if (!record) {json({success:false},404);return;}
      json({success:true,data:{status:record.status,completedFiles:record.completedFiles,totalFiles:2,result:record.result}});return;
    }
    if (url.pathname.startsWith('/sessions/')) {
      const [, , mode, id, action, fileId] = url.pathname.split('/');
      if (!id && req.method === 'GET') {
        capabilityReads.set(mode,(capabilityReads.get(mode)||0)+1);
        if (mode === 'older') {json({success:false},404);return;}
        if (mode === 'caperror') {json({success:false,message:'Controlled availability error'},503);return;}
        json({success:true,data:{protocol:1,mode:mode === 'legacy' || !stagedEnabled ? 'legacy' : 'staged'}});return;
      }
      const uploadId = id || url.searchParams.get('uploadId');
      const prior = records.get(uploadId);
      if (!id && req.method === 'POST') {
        let body = ''; req.on('data',chunk=>body+=chunk);
        req.on('end',()=>{
          if (!prior) records.set(uploadId,{mode,status:'processing',files:JSON.parse(body).files.map(file=>({...file,received:false})),writes:{},attempts:{},delivery:'queued'});
          if (mode === 'beginlost') {res.destroy();return;}
          json(status(records.get(uploadId)));
        }); return;
      }
      if (!prior) {json({success:false},404);return;}
      if (req.method === 'GET') {json(status(prior));return;}
      req.resume();
      req.on('end',()=>{
        if (action === 'files') {
          prior.attempts[fileId] = (prior.attempts[fileId]||0)+1;
          const index = prior.files.findIndex(file=>file.id===fileId);
          if (mode === 'retry' && index === 1 && prior.attempts[fileId] === 1) {json({success:false,message:'Controlled connection failure'},500);return;}
          if (!prior.files[index].received) {prior.files[index].received=true;prior.writes[fileId]=(prior.writes[fileId]||0)+1;}
          if (mode === 'drop' && index === 0) {res.destroy();return;}
          setTimeout(()=>json(status(prior)),150);return;
        }
        if (action === 'complete') {
          assert.ok(prior.files.every(file=>file.received));
          prior.status='succeeded';prior.result={success:true,data:{requestId:'received-request'}};
          json(prior.result);return;
        }
        json({success:false},404);
      });return;
    }
    res.setHeader('content-type','text/html');
    res.end('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:'+server.address().port);
    for (const viewport of [{width:1366,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button',{name:'Open upload modal',exact:true}).click();
      const dialog = page.getByRole('dialog',{name:'Upload Data'});
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.y >= -1 && bounds.y+bounds.height <= viewport.height+1,JSON.stringify({viewport,bounds}));
      assert.ok(bounds.x >= -1 && bounds.x+bounds.width <= viewport.width+1);
      await page.locator('input[type=file]').setInputFiles([{name:'check.txt',mimeType:'text/plain',buffer:Buffer.from('test')}]);
      await page.getByRole('button',{name:'Proceed to Confirmation'}).click();
      await page.getByRole('button',{name:'Confirm and Submit'}).scrollIntoViewIfNeeded();
      assert.ok(await page.getByRole('button',{name:'Confirm and Submit'}).isVisible());
      await page.getByRole('button',{name:'Close',exact:true}).click();
    }
    console.log('PASS: actual upload modal, actual CSS and transformed tall-page ancestor fit desktop, phone and landscape; confirmation accessible');
    await page.setViewportSize({width:390,height:844});
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:1024*1024,uploadThroughput:64*1024});
    await page.getByRole('button',{name:'success',exact:true}).click();
    await page.waitForFunction(()=>window.samples.some(t=>t.status==='transferring'&&t.currentPercent>0&&t.currentPercent<100));
    const activeBounds = await page.getByRole('region',{name:'Upload progress'}).boundingBox();
    assert.ok(activeBounds.y>=0 && activeBounds.y+activeBounds.height<=844);
    for (const viewport of [{width:1366,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]) {
      await page.setViewportSize(viewport);
      const centered = await page.getByRole('dialog',{name:'Upload progress'}).boundingBox();
      assert.ok(Math.abs(centered.x+centered.width/2-viewport.width/2)<2);
      assert.ok(Math.abs(centered.y+centered.height/2-viewport.height/2)<2);
      assert.ok(centered.y>=0 && centered.y+centered.height<=viewport.height);
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
    await page.getByRole('button',{name:'Minimize',exact:true}).click();
    assert.equal(await page.getByRole('dialog',{name:'Upload progress'}).count(),0);
    assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
    const compact = await page.getByRole('region',{name:'Upload progress'}).boundingBox();
    assert.ok(compact.y>844/2,'Minimized status belongs near the bottom');
    await page.getByRole('button',{name:'Navigate',exact:true}).click();
    await page.getByRole('button',{name:'Expand',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='complete');
    const samples = await page.evaluate(()=>window.samples);
    assert.ok(samples.some(t=>t.currentFile===1)&&samples.some(t=>t.currentFile===2));
    assert.ok(samples.some(t=>t.completedFiles===1&&t.percent===66),'Total must be weighted by bytes');
    assert.ok(samples.every(t=>t.percent>=0&&t.percent<=100));
    assert.equal(await page.evaluate(()=>window.completions||0),0,'No stale page callback');
    const successId = await page.evaluate(()=>window.uploadTask.id);
    assert.equal(records.get(successId).delivery,'queued','Finish must not wait for Drive');
    console.log('PASS: real throttled XHR file percentages, sequential 1/2 to 2/2, weighted total, minimize/navigation and finish before Drive');
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    await page.getByRole('button',{name:'drop',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='complete');
    const dropId=await page.evaluate(()=>window.uploadTask.id);
    assert.ok(Object.values(records.get(dropId).writes).every(count=>count===1));
    console.log('PASS: lost file acknowledgement recovers through status without duplicate writes');
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    await page.getByRole('button',{name:'retry',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='failed');
    const retryId=await page.evaluate(()=>window.uploadTask.id);
    stagedEnabled = false;
    await page.getByRole('button',{name:'Retry same upload',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='complete');
    const record=records.get(retryId);
    assert.equal(await page.evaluate(()=>window.uploadTask.id),retryId);
    assert.equal(record.attempts[record.files[0].id],1);
    assert.equal(record.attempts[record.files[1].id],2);
    assert.equal(capabilityReads.get('retry'),1,'Retry must not renegotiate mode');
    assert.equal(legacyWrites,0,'No fallback after staged admission');
    stagedEnabled = true;
    console.log('PASS: explicit retry keeps identity/mode and sends only the missing file even when readiness changes');
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    for (const mode of ['legacy','older']) {
      await page.getByRole('button',{name:mode,exact:true}).click();
      await page.waitForFunction(()=>window.uploadTask?.status==='saving' && window.uploadTask.percent===50);
      assert.equal(await page.evaluate(()=>window.uploadTask.transferPercent),100,'Request body fully sent');
      await page.getByText('Saving files — 1 of 2',{exact:true}).waitFor({timeout:1000});
      await page.waitForFunction(()=>window.uploadTask?.status==='complete');
      assert.equal(await page.evaluate(()=>window.uploadTask.mode),'legacy');
      const legacyId = await page.evaluate(()=>window.uploadTask.id);
      const legacySamples = await page.evaluate(id=>window.samples.filter(sample=>sample.id===id),legacyId);
      assert.ok(legacySamples.filter(sample=>sample.status!=='complete').every(sample=>sample.percent<100),'Total reaches 100% only with the last saved file');
      assert.equal(legacySamples.at(-1).percent,100);
      assert.equal(records.get(legacyId).mode,mode);
      await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    }
    assert.equal(legacyWrites,2);
    console.log('PASS: staging disabled and older backend both retain working multipart uploads; total % follows saved files to 100% with the last file');
    await page.getByRole('button',{name:'caperror',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='failed');
    const failedId = await page.evaluate(()=>window.uploadTask.id);
    assert.equal(records.has(failedId),false);
    assert.equal(legacyWrites,2,'503 must not cause blind fallback');
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    await page.getByRole('button',{name:'beginlost',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='complete');
    assert.equal(await page.evaluate(()=>window.uploadTask.mode),'staged');
    assert.equal(legacyWrites,2);
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    console.log('PASS: failed negotiation sends no files; lost session response recovers without switching protocol');

    // A known staged session retains its mode across an offline interruption.
    await page.route('**/sessions/offline/*/files/*',async route=>{
      if (!page.offlineInjected) {
        page.offlineInjected=true;
        await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        await route.abort('internetdisconnected');
      } else await route.continue();
    });
    await page.getByRole('button',{name:'offline',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='failed');
    const offlineId = await page.evaluate(()=>window.uploadTask.id);
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await page.getByRole('button',{name:'Retry same upload',exact:true}).click();
    await page.waitForFunction(()=>window.uploadTask?.status==='complete');
    assert.equal(await page.evaluate(()=>window.uploadTask.id),offlineId);
    assert.equal(capabilityReads.get('offline'),1);
    assert.equal(legacyWrites,2);
    await page.getByRole('button',{name:'Dismiss',exact:true}).click();
    console.log('PASS: offline/reconnect retains the admitted session and resumes with the same identity');
    await page.getByRole('button',{name:'owner',exact:true}).click();
    await page.evaluate(()=>window.switchOwner());
    await page.getByRole('region',{name:'Upload progress'}).waitFor({state:'hidden'});
    await page.waitForFunction(()=>window.uploadTask?.status==='complete');
    assert.equal(await page.evaluate(()=>window.completions),6);
    assert.deepEqual(errors,[]);
    console.log('PASS: account switch hides previous upload and suppresses its completion callback; no browser errors');
  } finally {
    await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
