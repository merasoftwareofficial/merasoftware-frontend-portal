const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {build}=require('../../merasoftware/node_modules/esbuild');
const {chromium}=require('../../merasoftware/node_modules/playwright');
(async()=>{
 const script=await build({stdin:{resolveDir:path.resolve(__dirname,'..'),loader:'jsx',contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {useLeadResource} from './src/hooks/useLeadResource';import {useLeadUpdates} from './src/hooks/useLeadUpdates';
 window.streams=[];window.calls=[];window.pending=[];window.delay=false;window.version=1;window.aborted=0;
 class FakeEvents {constructor(url,options){this.url=url;this.options=options;this.closed=false;window.streams.push(this)}close(){this.closed=true}}
 window.EventSource=FakeEvents;
 window.notify=message=>window.streams.filter(s=>!s.closed).forEach(s=>s.onmessage?.({data:JSON.stringify(message)}));
 window.fetch=async(url,options)=>{window.calls.push(url);options.signal.addEventListener('abort',()=>{window.aborted++});if(window.delay)await new Promise(resolve=>window.pending.push(resolve));return new Response(JSON.stringify({success:true,data:{version:window.version}}),{headers:{'content-type':'application/json'}})};
 function View({id}){const [data,setData]=useState(null),[draft,setDraft]=useState(''),[badge,setBadge]=useState('');const {refresh,loading,error}=useLeadResource('/lead/'+id,(next,initial)=>{setData(next);if(initial)setBadge('initial')});const live=useLeadUpdates(()=>refresh(),id);return <section><span data-testid={'value-'+id}>{data?.version}</span><span data-testid={'loading-'+id}>{String(loading)}</span><span>{error}{live}</span><input aria-label={'draft-'+id} value={draft} onChange={e=>setDraft(e.target.value)}/><input aria-label={'badge-'+id} value={badge} onChange={e=>setBadge(e.target.value)}/><button onClick={()=>refresh()}>Refresh {id}</button></section>}
 function App(){const [id,setId]=useState('one'),[show,setShow]=useState(true);return <><button onClick={()=>setShow(!show)}>Toggle</button><button onClick={()=>setId('three')}>Switch</button>{show&&<><View id={id}/><View id='two'/></>}</>}
 createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.REACT_APP_BACKEND_URL':'"http://api.test"','process.env.NODE_ENV':'"production"'}});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?script.outputFiles[0].text:'<div id="root"></div><script src="/app.js"></script>')});let browser;
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('[data-testid=value-one]')?.textContent==='1');
 assert.equal(await page.evaluate(()=>window.streams.length),1,'one shared connection for two views');assert.equal(await page.evaluate(()=>window.streams[0].options.withCredentials),true);
 await page.getByLabel('draft-one').fill('Unsaved message');await page.getByLabel('badge-one').fill('selected status');
 await page.evaluate(()=>{window.version=2;for(let n=0;n<20;n++)window.notify({type:'changed',ids:['one']})});await page.waitForFunction(()=>document.querySelector('[data-testid=value-one]').textContent==='2');
 assert.equal(await page.getByTestId('value-two').innerText(),'1','unrelated lead not fetched');assert.equal(await page.getByLabel('draft-one').inputValue(),'Unsaved message');assert.equal(await page.getByLabel('badge-one').inputValue(),'selected status');assert.equal(await page.getByTestId('loading-one').innerText(),'false');
 assert.equal(await page.evaluate(()=>window.calls.filter(x=>x==='/lead/one').length),2,'notification burst coalesced');
 await page.evaluate(()=>{window.delay=true});await page.getByRole('button',{name:'Refresh one',exact:true}).click();await page.getByRole('button',{name:'Refresh one',exact:true}).click();assert.equal(await page.evaluate(()=>window.pending.length),1,'no overlapping duplicate read');
 await page.evaluate(()=>{window.version=3;window.delay=false;window.pending.shift()()});await page.waitForFunction(()=>document.querySelector('[data-testid=value-one]').textContent==='3');
 await page.evaluate(()=>{window.version=4;window.notify({type:'ready'})});await page.waitForFunction(()=>document.querySelector('[data-testid=value-two]').textContent==='4');
 await page.evaluate(()=>{window.delay=true});await page.getByRole('button',{name:'Refresh one',exact:true}).click();await page.getByRole('button',{name:'Switch',exact:true}).click();
 await page.evaluate(()=>{window.version=5;window.delay=false;window.pending.splice(0).forEach(r=>r())});await page.waitForFunction(()=>document.querySelector('[data-testid=value-three]')?.textContent==='5');assert.ok(await page.evaluate(()=>window.aborted)>0,'route change aborts stale request');
 await page.getByRole('button',{name:'Toggle',exact:true}).click();assert.equal(await page.evaluate(()=>window.streams.every(s=>s.closed)),true,'last view closes stream');assert.deepEqual(errors,[]);console.log('PASS shared live connection, targeted burst refresh, unsaved form protection, reconnect reconciliation, duplicate reads and stale-request cleanup.');
 }finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
