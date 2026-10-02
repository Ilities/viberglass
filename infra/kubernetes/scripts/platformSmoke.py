import argparse, base64, contextlib, hashlib, json, pathlib, secrets, time, urllib.request, urllib.error, subprocess
parser = argparse.ArgumentParser(description="Exercise a disposable installed platform using the deterministic fake agent.")
parser.add_argument("--api-url", default="http://localhost:3100")
parser.add_argument("--kubeconfig", default="/tmp/viberglass-local.kubeconfig")
parser.add_argument("--namespace", default="viberglass")
parser.add_argument("--worker-namespace", default="viberglass-workers")
parser.add_argument("--credentials", default="/tmp/viberglass-platform-smoke-credentials.json")
args = parser.parse_args()
base = args.api_url.rstrip("/")
creds = pathlib.Path(args.credentials)
if creds.exists(): account=json.loads(creds.read_text())
else:
 account={'email':'kubernetes-smoke@example.com','name':'Kubernetes Smoke','password':secrets.token_urlsafe(24)}
 creds.write_text(json.dumps(account));creds.chmod(0o600)
token=None

def api(method,path,data=None):
 headers={'Content-Type':'application/json'}
 if token: headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as res: return json.load(res)
 except urllib.error.HTTPError as err:
  raise RuntimeError(f'{method} {path}: {err.code} {err.read().decode()}') from None

def entity(method,path,data=None):
 body=api(method,path,data)
 return body.get('data',body)



def task_with_media(project_id):
 content=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ24AAAAASUVORK5CYII=")
 boundary="viberglass-smoke-"+secrets.token_hex(8)
 chunks=[]
 for name,value in {"projectId":project_id,"title":"Kubernetes research smoke","description":"Explain greeting.js. Write RESEARCH.md."}.items():
  chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
 chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="screenshot"; filename="smoke.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
 request=urllib.request.Request(base+"/api/tasks",data=b"".join(chunks),headers={"Content-Type":"multipart/form-data; boundary="+boundary,"Authorization":"Bearer "+token},method="POST")
 with urllib.request.urlopen(request,timeout=30) as response: task=json.load(response)["data"]
 media=task["screenshot"]
 assert media["url"].startswith(base+"/api/tasks/media/"),media["url"]
 signed=entity("GET",f"/api/tasks/{task['id']}/media/{media['id']}/signed-url")["signedUrl"]
 assert urllib.request.urlopen(signed,timeout=30).read()==content
 print("Browser media upload and signed download passed",flush=True)
 return task

@contextlib.contextmanager
def git_fixture():
 name="viberglass-smoke-git-"+secrets.token_hex(3)
 labels={"app":name}
 resources={"apiVersion":"v1","kind":"List","items":[
  {"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":name,"namespace":args.namespace},"data":{"server.cjs":pathlib.Path(__file__).with_name("gitFixture.cjs").read_text()}},
  {"apiVersion":"v1","kind":"Pod","metadata":{"name":name,"namespace":args.namespace,"labels":labels},"spec":{"automountServiceAccountToken":False,"containers":[{"name":"git","image":"viberator-worker-fake:local","imagePullPolicy":"IfNotPresent","command":["node","/fixture/server.cjs"],"volumeMounts":[{"name":"fixture","mountPath":"/fixture","readOnly":True}]}],"volumes":[{"name":"fixture","configMap":{"name":name}}]}},
  {"apiVersion":"v1","kind":"Service","metadata":{"name":name,"namespace":args.namespace},"spec":{"selector":labels,"ports":[{"port":39101,"targetPort":39101}]}},
  {"apiVersion":"networking.k8s.io/v1","kind":"NetworkPolicy","metadata":{"name":name,"namespace":args.worker_namespace},"spec":{"podSelector":{"matchLabels":{"app.kubernetes.io/name":"viberglass-worker"}},"policyTypes":["Egress"],"egress":[{"to":[{"namespaceSelector":{"matchLabels":{"kubernetes.io/metadata.name":args.namespace}},"podSelector":{"matchLabels":labels}}],"ports":[{"protocol":"TCP","port":39101}]}]}}
 ]}
 kube=["kubectl","--kubeconfig",args.kubeconfig]
 subprocess.run(kube+["create","-f","-"],input=json.dumps(resources),text=True,check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run(kube+["-n",args.namespace,"wait","--for=condition=Ready","pod/"+name,"--timeout=60s"],check=True,stdout=subprocess.DEVNULL)
  yield f"http://{name}.{args.namespace}.svc.cluster.local:39101/fixture.git"
 finally:
  subprocess.run(kube+["delete","-f","-","--wait=false"],input=json.dumps(resources),text=True,check=True,stdout=subprocess.DEVNULL)

with git_fixture() as repository_url:
 setup=api('GET','/api/auth/setup-status')
 if setup.get('requiresInitialUser',setup.get('data',{}).get('requiresInitialUser')):
  token=api('POST','/api/auth/register',account)['token']
 else: token=api('POST','/api/auth/login',{'email':account['email'],'password':account['password']})['token']
 strategies=entity('GET','/api/deployment-strategies')
 strategy=next(item for item in strategies if item['name']=='kubernetes')
 seclist=entity('GET','/api/secrets')
 secret=next((s for s in seclist if s['name']=='FAKE_API_KEY'),None)
 if not secret: secret=entity('POST','/api/secrets',{'name':'FAKE_API_KEY','secretValue':'offline-smoke-key','secretLocation':'database'})
 runner=entity('POST','/api/clankers',{'name':'Kubernetes Smoke '+str(int(time.time())),'agent':'fake','configFiles':[{'fileType':'AGENTS.md','content':'Use the local fixture repository for the smoke task.'}],'secretBindings':[{'envVar':'FAKE_API_KEY','secretId':secret['id']}],'deploymentStrategyId':strategy['id'],'deploymentConfig':{'version':1,'strategy':{'type':'kubernetes','containerImage':'viberator-worker-fake:local','cpu':'250m','memory':'512Mi'},'agent':{'type':'fake'}}})
 entity('POST',f"/api/clankers/{runner['id']}/start",{})
 for i in range(60):
  status=entity('GET',f"/api/clankers/{runner['id']}")
  if status['status']=='active': break
  if status['status']=='failed': raise RuntimeError(status['statusMessage'])
  time.sleep(1)
 else: raise RuntimeError('Worker did not activate')
 print('Kubernetes strategy and admission checks passed',flush=True)
 integration=entity('POST','/api/integrations',{'name':'Smoke GitHub','system':'github','config':{}})
 space=entity('POST','/api/spaces',{'name':'Kubernetes Smoke '+str(int(time.time()))})
 entity('POST',f"/api/integrations/space/{space['id']}/link",{'integrationId':integration['id'],'isPrimary':True})
 entity('PUT',f"/api/spaces/{space['id']}/scm-config",{'integrationId':integration['id'],'sourceRepository':repository_url,'baseBranch':'main'})
 task=task_with_media(space["id"])

 def ask(task,body): return api('POST',f"/api/tasks/{task['id']}/messages",{'action':'research','body':body,'agentId':runner['id']})['turn']
 def waitjob(id):
  for i in range(150):
   status=api('GET',f'/api/jobs/{id}')
   if status['status'] in ['completed','failed','cancelled']: return status
   time.sleep(2)
  raise RuntimeError('Run did not complete')
 turn=ask(task,'Write the research')
 result=waitjob(turn['jobId'])
 if result['status']!='completed': raise RuntimeError(json.dumps(result))
 doc=entity('GET',f"/api/tasks/{task['id']}/phases/research")
 assert 'turn 1' in doc['document']['content'],doc

 worker_job="viberglass-"+hashlib.sha256(turn["jobId"].encode()).hexdigest()[:32]
 logs=subprocess.check_output(["kubectl","--kubeconfig",args.kubeconfig,"-n",args.worker_namespace,"logs","job/"+worker_job],text=True)
 bootstrap=[]
 for line in logs.splitlines():
  try: entry=json.loads(line)
  except json.JSONDecodeError: continue
  if isinstance(entry,dict): bootstrap.append(entry)
 assert any(entry.get("instructionFilesLoaded")==1 and entry.get("credentialsFetched")==1 for entry in bootstrap)
 print('First research task and persisted document passed',flush=True)
 turn2=ask(task,'Revise RESEARCH.md with a second observation')
 result=waitjob(turn2['jobId'])
 if result['status']!='completed': raise RuntimeError(json.dumps(result))
 doc=entity('GET',f"/api/tasks/{task['id']}/phases/research")
 assert 'turn 2' in doc['document']['content'],doc
 print('Session resumed in a new worker Pod and wrote turn 2',flush=True)
 cancelTask=entity('POST','/api/tasks',{'projectId':space['id'],'title':'Cancel Kubernetes worker','description':'Write RESEARCH.md. [fake:sleep=60]'})
 cancel=ask(cancelTask,'Write research')
 for i in range(60):
  status=api('GET',f"/api/jobs/{cancel['jobId']}")
  if status['status']=='active' and status.get('progress',{}).get('step') in ['clone', 'execute', 'prompt', 'initialize']: break
  time.sleep(0.25)
 api('POST',f"/api/jobs/{cancel['jobId']}/cancel",{})
 assert api('GET',f"/api/jobs/{cancel['jobId']}")['status']=='cancelled'
 time.sleep(1)
 assert api('GET',f"/api/jobs/{cancel['jobId']}")['status']=='cancelled'
 immediateTask=entity('POST','/api/tasks',{'projectId':space['id'],'title':'Cancel during dispatch','description':'Write RESEARCH.md. [fake:sleep=60]'})
 immediate=ask(immediateTask,'Write research')
 api('POST',f"/api/jobs/{immediate['jobId']}/cancel",{})
 time.sleep(2)
 assert api('GET',f"/api/jobs/{immediate['jobId']}")['status']=='cancelled'
 print('Cancellation during execution and dispatch passed',flush=True)
 for run in [cancel,immediate]:
  name="viberglass-"+hashlib.sha256(run["jobId"].encode()).hexdigest()[:32]
  stopped=subprocess.run(["kubectl","--kubeconfig",args.kubeconfig,"-n",args.worker_namespace,"get","job",name],capture_output=True,text=True)
  assert stopped.returncode!=0 and "NotFound" in stopped.stderr, "Cancelled worker Job still exists"
 print('Platform smoke passed: activation, bootstrap, research, persisted document, session restore, cancellation', flush=True)
