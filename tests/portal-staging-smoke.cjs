// Read-only staging checks. Cookie is read from the environment and never logged.
const assert = require('node:assert/strict');
async function verify({apiOrigin,portalOrigin,siteOrigin,cookie,fetchImpl=fetch}) {
  const origins=[apiOrigin,portalOrigin,siteOrigin].map(value=>{
    const url=new URL(value);assert(['http:','https:'].includes(url.protocol));
    assert.equal(url.origin,value.replace(/\/$/,''),'Use origins without paths');return url.origin;
  });
  const [api,portal,site]=origins;assert(cookie,'STAGING_SESSION_COOKIE is required');
  for(const origin of [portal,site]){
    const response=await fetchImpl(origin,{signal:AbortSignal.timeout(15000)});
    assert(response.ok,'Website/portal entry failed with status '+response.status);
    assert((response.headers.get('content-type')||'').includes('text/html'),'HTML entry expected');
    await response.body?.cancel();
  }
  const session=await fetchImpl(api+'/api/user-details',{headers:{Cookie:cookie,Origin:portal},signal:AbortSignal.timeout(15000),redirect:'error'});
  assert.equal(session.status,200,'Staging session rejected');
  assert.equal(session.headers.get('access-control-allow-origin'),portal,'Credentialed CORS origin mismatch');
  assert.equal(session.headers.get('access-control-allow-credentials'),'true','Credentialed CORS missing');
  const identity=await session.json();assert(identity.success&&identity.data?._id,'Invalid staging session response');
  const denied=await fetchImpl(api+'/api/portal-updates',{headers:{Origin:portal},signal:AbortSignal.timeout(15000),redirect:'error'});
  try {assert([401,403].includes(denied.status),'Anonymous live feed was not rejected');}finally{await denied.body?.cancel();}
  for(let attempt=0;attempt<2;attempt++){
    const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),15000);
    let reader;
    try{
      const response=await fetchImpl(api+'/api/portal-updates',{headers:{Cookie:cookie,Origin:portal},signal:abort.signal,redirect:'error'});
      assert.equal(response.status,200,'Live feed not available');
      assert((response.headers.get('content-type')||'').includes('text/event-stream'),'Proxy is not serving SSE');
      assert.equal(response.headers.get('access-control-allow-origin'),portal,'SSE CORS mismatch');
      reader=response.body.getReader();let buffer='';const decoder=new TextDecoder();let ready=false;
      while(!ready){
        const chunk=await reader.read();assert(!chunk.done,'Live feed ended before ready');buffer+=decoder.decode(chunk.value,{stream:true});
        let end;while((end=buffer.indexOf('\n\n'))>=0){
          const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
          for(const line of frame.split('\n').filter(x=>x.startsWith('data:'))){const message=JSON.parse(line.slice(5));assert(!['denied','unavailable'].includes(message.type),'Feed denied/unavailable');if(message.type==='ready')ready=true;}
        }
        assert(buffer.length<65536,'Unexpected SSE buffer growth');
      }
    }finally{clearTimeout(timeout);await reader?.cancel();abort.abort();}
  }
  return {entries:true,session:true,credentialedCors:true,anonymousDenied:true,sseReadyAndReconnect:true};
}
module.exports={verify};
if(require.main===module){
  verify({apiOrigin:process.env.STAGING_API_ORIGIN,portalOrigin:process.env.STAGING_PORTAL_ORIGIN,siteOrigin:process.env.STAGING_SITE_ORIGIN,cookie:process.env.STAGING_SESSION_COOKIE})
    .then(result=>console.log('PASS read-only staging checks:',JSON.stringify(result)))
    .catch(()=>{console.error('FAIL staging smoke check. Verify configured origins/session, CORS and live-feed availability; no secret values logged.');process.exitCode=1;});
}
