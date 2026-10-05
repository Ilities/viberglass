const {execFileSync}=require('child_process');
const {mkdtempSync,writeFileSync}=require('fs');
const {tmpdir}=require('os');
const {join}=require('path');
const http=require('http');
const fs=require('fs');
const root=mkdtempSync(join(tmpdir(),'viberglass-k8s-repo-'));
function git(cwd,...args){execFileSync('git',args,{cwd,stdio:'ignore'});}
git(root,'init','--bare','--initial-branch=main','fixture.git');
git(root,'clone',join(root,'fixture.git'),'work');
writeFileSync(join(root,'work','greeting.js'),"export const greeting = () => 'hello';\n");
git(join(root,'work'),'add','.');git(join(root,'work'),'-c','user.name=Smoke','-c','user.email=smoke@example.test','commit','-m','Fixture');git(join(root,'work'),'push','origin','main');git(join(root,'fixture.git'),'update-server-info');
http.createServer((req,res)=>{const path=join(root,decodeURIComponent(req.url.split('?')[0]));if(!path.startsWith(root)){res.writeHead(403).end();return;}try{if(!fs.statSync(path).isFile())throw Error();fs.createReadStream(path).pipe(res);}catch{res.writeHead(404).end();}}).listen(39101,'0.0.0.0',()=>console.log(root));
