import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=39876;
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:String(port),DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
let error='';
child.stderr.on('data',chunk=>error+=chunk.toString());
async function get(path,opts={}) {return fetch('http://127.0.0.1:'+port+path,opts);}
try {
  let ready=false;
  for(let i=0;i<50;i++){try{let r=await get('/health');if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'server failed to start '+error);
  let health=await get('/health');assert.equal(health.status,200);assert.equal((await health.json()).service,'zimba-rent-api');
  let db=await get('/ready');assert.equal(db.status,503);
  let unsafe=await get('/api/v1/properties',{method:'POST'});assert.equal(unsafe.status,405);
  let pre=await get('/api/v1/properties',{method:'OPTIONS',headers:{Origin:'https://not-allowed.example'}});assert.equal(pre.status,403);
  console.log('API PASS: /health 200, /ready without database 503, POST 405, disallowed origin 403');
} finally {child.kill('SIGTERM');}
