import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root=process.cwd();
for (const [id,className] of [['swasthya','Swasthya'],['kosh','Kosh']]) {
 const out=path.join(root,'work','web-demos',id);await fs.mkdir(out,{recursive:true});
 await fs.cp(path.join(root,'apps',id,'dist'),out,{recursive:true,filter:p=>!p.endsWith('.mp4')});
 const entry=`import {${className}} from './apps/${id}/server/api.mjs';
const original=window.fetch.bind(window);
const ready=(async()=>{const app=await new ${className}({dataDir:'${id}'}).load();if(!app.db.members.length)await app.loadSample();return app;})();
window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin!==location.origin||(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/.well-known/')))return original(input,init);
 try{const app=await ready;if(url.pathname.startsWith('/.well-known/'))return Response.json({name:'${className} browser demo',description:'Browser-only sample data. Use the desktop app for agent connections.',endpoints:[]});
 const route=url.pathname.slice(5);if(route==='session')return Response.json({token:app.db.token});
 if(route==='budh')return Response.json({error:'Budh AI is not connected in this browser demo. Use Swasthya in Larp with your configured provider.'},{status:503});
 const method=init.method||(input instanceof Request?input.method:'GET');const raw=init.body||(input instanceof Request&&method!=='GET'?await input.text():null);
 return Response.json(await app.route(method,route.split('/').filter(Boolean),raw?JSON.parse(raw):{},url.searchParams));
 }catch(e){return Response.json({error:e.message},{status:e.status||500});}};
document.addEventListener('DOMContentLoaded',()=>{const bar=document.createElement('div');bar.textContent='${className} demo · Fictional sample data · Changes stay in this browser';bar.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:6px 12px;background:#24211e;color:#fff;font:12px system-ui;text-align:center;';document.body.append(bar);});`;
 const shims={
 'node:fs/promises':`const key=p=>'larp-web-demo:'+p;export default {mkdir:async()=>{},readFile:async p=>{const v=localStorage.getItem(key(p));if(v===null)throw Object.assign(new Error('Missing'),{code:'ENOENT'});return v;},writeFile:async(p,v)=>localStorage.setItem(key(p),v),rename:async(a,b)=>{localStorage.setItem(key(b),localStorage.getItem(key(a)));localStorage.removeItem(key(a));}};`,
 'node:path':`export default {join:(...p)=>p.join('/'),dirname:p=>p.split('/').slice(0,-1).join('/')};`,
 'node:crypto':`export default {randomBytes:n=>{const a=crypto.getRandomValues(new Uint8Array(n));return {toString:format=>format==='hex'?Array.from(a,x=>x.toString(16).padStart(2,'0')).join(''):btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}}};`
 };
 await build({stdin:{contents:entry,resolveDir:root,sourcefile:'browser-demo.js'},bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'browser-demo.js'),plugins:[{name:'browser-storage',setup(b){b.onResolve({filter:/^node:/},a=>({path:a.path,namespace:'shim'}));b.onLoad({filter:/.*/,namespace:'shim'},a=>({contents:shims[a.path]||'',loader:'js'}));}}]});
 const html=await fs.readFile(path.join(out,'index.html'),'utf8');await fs.writeFile(path.join(out,'index.html'),html.replace('<head>','<head>\n<script src="/browser-demo.js"></script>'));
 await fs.writeFile(path.join(out,'vercel.json'),JSON.stringify({version:2,rewrites:[{source:'/((?!assets/|browser-demo.js|.*\\.[a-z]+$).*)',destination:'/index.html'}]}));
 console.log('Built browser-isolated demo:',id);
}
