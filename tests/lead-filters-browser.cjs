const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');
(async () => {
 const script = await build({stdin:{resolveDir:path.resolve(__dirname,'..'),loader:'jsx',contents:`
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {BrowserRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
 import Leads from './src/pages/AdminLeadsPage';
 import {getAdminReturnTarget} from './src/helpers/adminReturnNavigation';
 window.calls=[];
 window.fetch=async url=>{ window.calls.push(String(url)); return new Response(JSON.stringify({success:true,data:String(url).includes('final-message')?{count:0}:[{_id:'lead1',name:'Ravi',email:'ravi@example.test',phone:'9876543210',status:'Negative',source:'manual',proposalSentAt:'2026-10-30',createdAt:'2026-10-30'}]}),{headers:{'content-type':'application/json'}}); };
 function Detail(){const location=useLocation(),navigate=useNavigate();return <button onClick={()=>navigate(getAdminReturnTarget(location,'/admin-panel/leads'))}>Return to leads</button>}
 createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path='/admin-panel/leads' element={<Leads/>}/><Route path='/admin-panel/leads/:id' element={<Detail/>}/></Routes></BrowserRouter>);
 `},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.js':'jsx'},define:{'process.env.REACT_APP_BACKEND_URL':'"http://api.test"','process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'isolate-app-shell',setup(b){
 b.onResolve({filter:/^react-redux$/},()=>({path:'redux',namespace:'test'}));
 b.onResolve({filter:/^\.\.\/App$/},()=>({path:'app',namespace:'test'}));
 b.onResolve({filter:/\/AdminLayout$/},()=>({path:'layout',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='redux'?"export const useSelector=fn=>fn({user:{user:{_id:'admin',roles:['admin']}}});export const useDispatch=()=>()=>{};":args.path==='app'?"export const useOnlineStatus=()=>({isOnline:true});":"export default function Layout({children}){return children}",loader:'js'}));
 }}]});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?script.outputFiles[0].text:'<div id="root"></div><script src="/app.js"></script>')});let browser;
 try {await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.message)});
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin+'/admin-panel/leads?status=Negative&source=normal&sort=nameAsc&proposal=1&q=Ravi');
 const search=page.getByPlaceholder('Search leads by name, email, or phone');await search.waitFor();await page.getByRole('button').filter({hasText:'1. Ravi'}).click();await page.getByRole('button',{name:'Return to leads'}).click();
 assert.equal(await search.inputValue(),'Ravi');for(const [key,value] of Object.entries({status:'Negative',source:'normal',sort:'nameAsc',proposal:'1',q:'Ravi'}))assert.equal(new URL(page.url()).searchParams.get(key),value);
 await page.reload();await page.getByRole('button').filter({hasText:'1. Ravi'}).waitFor();assert.equal(await search.inputValue(),'Ravi');
 const before=await page.evaluate(()=>window.calls.length);await search.fill('Not present');await page.getByText(/No leads/).first().waitFor();assert.equal(await page.evaluate(()=>window.calls.length),before,'changing filters sends no extra API calls');assert.deepEqual(errors,[]);console.log('PASS: actual Leads filters survive return + reload; filter changes make zero API calls.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
