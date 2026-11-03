import assert from 'node:assert/strict';
import http from 'node:http';
import {postJson} from '../electron/space-network.cjs';
const server=http.createServer((req,res)=>{if(req.url==='/api/hang')return;if(req.url==='/api/html'){res.end('<html>not Larp</html>');return;}res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invite expired'}));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{await assert.rejects(postJson(url,'join',{}),/Invite expired/);await assert.rejects(postJson(url,'html',{}),/did not return a Larp response/);await assert.rejects(postJson(url,'hang',{},null,{timeoutMs:100}),/Cannot reach.*own computer/);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
await assert.rejects(postJson(url,'join',{}),/Cannot reach.*ECONN(?:REFUSED|RESET)/);
console.log('PASS timeout, unreachable host, wrong server and invite errors');
