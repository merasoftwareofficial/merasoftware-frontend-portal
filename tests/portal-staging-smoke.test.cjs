const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verify}=require('./portal-staging-smoke.cjs');
const config={apiOrigin:'https://api.fixture.test',portalOrigin:'https://portal.fixture.test',siteOrigin:'https://site.fixture.test',cookie:'token=fixture'};
function fixture({anonymousAllowed=false,badCors=false,unavailable=false}={}){
 return async (url,options={})=>{
  if(!url.startsWith(config.apiOrigin)){assert(!options.headers?.Cookie);return new Response('<html/>',{headers:{'content-type':'text/html'}});}
  const headers={'access-control-allow-origin':badCors?'https://wrong.fixture.test':config.portalOrigin,'access-control-allow-credentials':'true'};
  if(url.endsWith('/user-details'))return Response.json({success:true,data:{_id:'fixture'}},{headers});
  if(!options.headers.Cookie)return new Response(null,{status:anonymousAllowed?200:401});
  headers['content-type']='text/event-stream';
  return new Response('retry: 5000\n\ndata: '+JSON.stringify({type:unavailable?'unavailable':'ready'})+'\n\n',{headers});
 };
}
test('read-only smoke verifies HTML, cookie CORS, anonymous denial and two SSE connections',async()=>{
 assert.deepEqual(await verify({...config,fetchImpl:fixture()}),{entries:true,session:true,credentialedCors:true,anonymousDenied:true,sseReadyAndReconnect:true});
});
test('smoke rejects anonymous feed access',async()=>{await assert.rejects(verify({...config,fetchImpl:fixture({anonymousAllowed:true})}),/Anonymous/);});
test('smoke rejects wrong credentialed CORS',async()=>{await assert.rejects(verify({...config,fetchImpl:fixture({badCors:true})}),/CORS/);});
test('smoke rejects an unavailable watch transport',async()=>{await assert.rejects(verify({...config,fetchImpl:fixture({unavailable:true})}),/unavailable/);});
