const colors={"upstream-definition":"#4f46e5","project-start":"#1f77b4","feature-level":"#d97706","release":"#c23b53","external":"#7b8794"};
let data,cy,selectedId=null; const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const byId=id=>data.nodes.find(n=>n.id===id); const dependents=id=>data.nodes.filter(n=>(n.dependsOn||[]).includes(id));
const pills=a=>(a&&a.length)?`<div class="pills">${a.map(x=>`<span class="pill">${esc(x)}</span>`).join("")}</div>`:'<span class="empty">None</span>';
let depths={},importance={},keystones=new Set(),documented=new Set();
// flow centrality: how many artifacts upstream connect through this node to how many downstream.
// keystones = every artifact scoring >=90% of the max (currently: the nine spine artifacts)
function computeImportance(){const isArt=id=>byId(id).type==='artifact';
const upAdj=new Map(),downAdj=new Map();
for(const n of data.nodes)for(const d of n.dependsOn||[]){if(!byId(d))continue;if(!downAdj.has(d))downAdj.set(d,[]);downAdj.get(d).push(n.id);if(!upAdj.has(n.id))upAdj.set(n.id,[]);upAdj.get(n.id).push(d)}
const reach=(id,adj)=>{const seen=new Set(),st=[...(adj.get(id)||[])];while(st.length){const c=st.pop();if(seen.has(c))continue;seen.add(c);for(const x of adj.get(c)||[])if(!seen.has(x))st.push(x)}return seen};
const rows=[];
for(const n of data.nodes){if(n.type!=='artifact')continue;
const a=[...reach(n.id,upAdj)].filter(isArt).length,de=[...reach(n.id,downAdj)].filter(isArt).length;
importance[n.id]={a,de,score:(a+1)*(de+1)};rows.push(n.id)}
rows.sort((x,y)=>importance[y].score-importance[x].score);
rows.forEach((id,i)=>importance[id].rank=i+1);
keystones=new Set(rows.filter(id=>importance[id].score>=.9*importance[rows[0]].score))}
function computeDepths(){const memo={},seen=new Set();const walk=id=>{if(memo[id]!==undefined)return memo[id];if(seen.has(id))return 0;seen.add(id);const ds=(byId(id).dependsOn||[]).filter(byId);memo[id]=ds.length?1+Math.max(...ds.map(walk)):0;seen.delete(id);return memo[id]};data.nodes.forEach(n=>walk(n.id));
// pull external inputs rightward, next to their earliest consumer, so they don't all stack at level 0
for(const n of data.nodes){if(n.type!=='external-input')continue;const ds=dependents(n.id).map(x=>memo[x.id]);if(ds.length)memo[n.id]=Math.max(0,Math.min(...ds)-1)}depths=memo}
// ---- Project tracking (POC, localStorage) ----
const PKEY='artifact-graph-project-v1';
const STATUS_LABEL={todo:'Not started',wip:'In progress',done:'Done'};
let project=null;
function loadProject(){try{project=JSON.parse(localStorage.getItem(PKEY))}catch(e){project=null}}
function saveProject(){localStorage.setItem(PKEY,JSON.stringify(project));renderProject();refreshDone()}
// status of an artifact: shared artifacts read project.status; feature-level artifacts read the
// given feature's map, or aggregate across features (done only when done in every feature)
function getStatus(id,feat){if(!project)return 'todo';const n=byId(id);if(n&&n.stage==='feature-level'){if(feat)return feat.status[id]||'todo';if(!project.features.length)return 'todo';const st=project.features.map(f=>f.status[id]||'todo');return st.every(s=>s==='done')?'done':st.some(s=>s!=='todo')?'wip':'todo'}return project.status[id]||'todo'}
// safe: every hard dep done · conditional: no dep untouched · unsafe: some dep not started
function readiness(id,feat){if(getStatus(id,feat)==='done')return 'done';const st=((byId(id).dependsOn)||[]).filter(byId).map(d=>getStatus(d,feat));if(st.every(s=>s==='done'))return 'safe';if(st.every(s=>s!=='todo'))return 'conditional';return 'unsafe'}
// how many artifact-steps away from workable an item is (externals cost 0, artifacts 1 per layer)
function readyDist(id,feat,seen=new Set()){if(getStatus(id,feat)==='done'||seen.has(id))return 0;seen.add(id);
const miss=((byId(id).dependsOn)||[]).filter(byId).filter(d=>getStatus(d,feat)!=='done');
return miss.length?Math.max(...miss.map(d=>byId(d).type==='external-input'?0:1+readyDist(d,feat,seen))):0}
function nbaByRole(){
// for each missing external, how close is the nearest artifact waiting on it
const extMin=new Map();for(const r of frontier()){const rd=readyDist(r.n.id,r.f);for(const m of r.m){if(byId(m).type!=='external-input')continue;if(!extMin.has(m)||rd<extMin.get(m))extMin.set(m,rd)}}
const roles=[...new Set(data.nodes.flatMap(n=>[...(n.author||[]),...(n.owner||[])]))].sort();
const rank={gather:0,safe:0,conditional:1};
return roles.map(role=>{const cands=[];for(const n of data.nodes){
// externals: the owning role's action is to go gather it — when the waiting work is near (≤3 steps) or it's a long-lead earlyRequest item
if(n.type==='external-input'){if((n.owner||[]).includes(role)&&getStatus(n.id)!=='done'&&extMin.has(n.id)&&(n.earlyRequest||extMin.get(n.id)<=3))cands.push({n,r:'gather',d:extMin.get(n.id)});continue}
if(!(n.author||[]).includes(role))continue;
if(n.stage==='feature-level'){for(const f of project.features){if((f.status[n.id]||'todo')==='done')continue;const r=readiness(n.id,f);if(r==='safe'||r==='conditional')cands.push({n,f,r})}}
else{if(getStatus(n.id)==='done')continue;const r=readiness(n.id);if(r==='safe'||r==='conditional')cands.push({n,r})}}
cands.sort((a,b)=>rank[a.r]-rank[b.r]||(a.d??0)-(b.d??0)||depths[a.n.id]-depths[b.n.id]);return {role,best:cands[0]||null}})}
// every not-done artifact (shared, and feature-level per feature) with the deps it is still missing
function frontier(){const rows=[],missing=(n,feat)=>((n.dependsOn)||[]).filter(byId).filter(d=>getStatus(d,feat)!=='done');
for(const n of data.nodes){if(n.type!=='artifact')continue;
if(n.stage==='feature-level'){for(const f of project.features){if((f.status[n.id]||'todo')==='done')continue;const m=missing(n,f);if(m.length)rows.push({n,f,m})}}
else{if(getStatus(n.id)==='done')continue;const m=missing(n);if(m.length)rows.push({n,m})}}
rows.sort((a,b)=>a.m.length-b.m.length||depths[a.n.id]-depths[b.n.id]);return rows}
function refreshDone(){cy.nodes().forEach(n=>n.toggleClass('done',project?getStatus(n.id())==='done':false))}
function showTab(t){for(const [tab,pane] of [['tabExplore','details'],['tabProject','project']]){const on=(t==='explore')===(pane==='details');document.getElementById(pane).style.display=on?'':'none';document.getElementById(tab).classList.toggle('active',on)}}
function statusControls(n){if(!project)return '';const opts=cur=>['todo','wip','done'].map(s=>`<option value="${s}"${cur===s?' selected':''}>${STATUS_LABEL[s]}</option>`).join('');
if(n.stage==='feature-level'){if(!project.features.length)return '<h3>Status</h3><p class="empty">Add a feature in the Project tab to track this artifact per feature.</p>';
return '<h3>Status by feature</h3>'+project.features.map((f,i)=>{const r=readiness(n.id,f);return `<div class="statusrow"><span class="rolename">${esc(f.name)}</span><span class="badge b-${r}">${r}</span><select class="stsel" data-feat="${i}">${opts(f.status[n.id]||'todo')}</select></div>`}).join('')}
const r=readiness(n.id);return `<h3>Status</h3><div class="statusrow"><span class="badge b-${r}">${r}</span><select class="stsel">${opts(project.status[n.id]||'todo')}</select></div>`}
function bindStatusControls(){document.querySelectorAll('.stsel').forEach(s=>s.onchange=e=>{const v=e.target.value,fi=e.target.dataset.feat;if(fi!=null)project.features[+fi].status[selectedId]=v;else project.status[selectedId]=v;saveProject();details(selectedId)})}
function renderProject(){const el=document.getElementById('project');
if(!project){el.innerHTML=`<h2>Project</h2><p class="empty">Start a project to track artifact status and get a next best action per role. Stored in this browser only.</p><div class="statusrow"><input id="pname" placeholder="Project name"><button id="pstart">Start project</button></div>`;
document.getElementById('pstart').onclick=()=>{const v=document.getElementById('pname').value.trim();if(v){project={name:v,createdAt:new Date().toISOString(),status:{},features:[]};saveProject()}};return}
const shared=data.nodes.filter(n=>n.type==='artifact'&&n.stage!=='feature-level'),ext=data.nodes.filter(n=>n.type==='external-input');
const featIds=data.nodes.filter(n=>n.stage==='feature-level').map(n=>n.id);
const fr=frontier(),wanted=new Map();
for(const r of fr)for(const m of r.m)wanted.set(m,(wanted.get(m)||0)+1);
// only count deps that are themselves ready to be worked (or externals) — finishing those moves the frontier
const topWanted=[...wanted.entries()].filter(([id])=>{const n=byId(id);return n.type==='external-input'||readiness(id)!=='unsafe'}).sort((a,b)=>b[1]-a[1]).slice(0,6);
el.innerHTML=`<h2>${esc(project.name)}</h2>
<div class="meta">${shared.filter(n=>getStatus(n.id)==='done').length}/${shared.length} project artifacts done · ${ext.filter(n=>getStatus(n.id)==='done').length}/${ext.length} external inputs received</div>
<h3>Next best action by role</h3>
${nbaByRole().map(({role,best})=>`<div class="nba"><span class="rolename">${esc(role)}</span>${best?`<span class="badge b-${best.r}">${best.r}</span><button data-node="${best.n.id}">${best.r==='gather'?'Get: ':''}${esc(best.n.name)}${best.f?` — ${esc(best.f.name)}`:''}</button>`:'<span class="empty">nothing safe to start</span>'}</div>`).join('')}
<h3>Features</h3>
${project.features.map((f,i)=>`<div class="featrow"><span class="rolename">${esc(f.name)}</span><span class="meta">${featIds.filter(id=>(f.status[id]||'todo')==='done').length}/${featIds.length} done</span><button data-del="${i}" title="Remove feature">×</button></div>`).join('')||'<p class="empty">No features yet. Feature-level artifacts are tracked per feature.</p>'}
<div class="statusrow"><input id="fname" placeholder="Feature name"><button id="fadd">Add feature</button></div>
<h3>Most wanted inputs</h3>
${topWanted.map(([id,c])=>`<div class="nba"><button data-node="${id}">${esc(byId(id).name)}</button><span class="empty">${byId(id).type==='external-input'?'external · ':''}unblocks ${c} item${c>1?'s':''}</span></div>`).join('')||'<p class="empty">Nothing is blocked.</p>'}
<h3>Closest to ready</h3>
${fr.slice(0,6).map(r=>`<div class="nba"><button data-node="${r.n.id}">${esc(r.n.name)}${r.f?` — ${esc(r.f.name)}`:''}</button><span class="empty">waiting on ${esc(r.m.slice(0,3).map(id=>byId(id).name).join(', '))}${r.m.length>3?` +${r.m.length-3} more`:''}</span></div>`).join('')||'<p class="empty">Everything is done.</p>'}
<p class="note"><button id="preset">Reset project</button></p>`;
el.querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>select(b.dataset.node));
document.getElementById('fadd').onclick=()=>{const v=document.getElementById('fname').value.trim();if(v){project.features.push({name:v,status:{}});saveProject()}};
el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{project.features.splice(+b.dataset.del,1);saveProject()});
document.getElementById('preset').onclick=()=>{if(confirm('Reset project? All tracked status in this browser is lost.')){project=null;localStorage.removeItem(PKEY);renderProject();refreshDone()}}}
function runLayout(){const visible=cy.elements(':visible');if(document.getElementById('layout').value==='layered'){const levels=new Map();visible.nodes().forEach(n=>{const d=depths[n.id()]||0;if(!levels.has(d))levels.set(d,[]);levels.get(d).push(n.id())});const pos={};for(const d of [...levels.keys()].sort((a,b)=>a-b)){const ids=levels.get(d);const bary=id=>{const ys=((byId(id).dependsOn)||[]).filter(x=>pos[x]).map(x=>pos[x].y);return ys.length?ys.reduce((a,b)=>a+b)/ys.length:0};ids.sort((a,b)=>bary(a)-bary(b));ids.forEach((id,i)=>pos[id]={x:d*260,y:(i-(ids.length-1)/2)*80})}cy.layout({name:'preset',positions:n=>pos[n.id()]||{x:0,y:0},fit:false}).run()}else{cy.layout({name:'breadthfirst',directed:true,spacingFactor:1.25,padding:35,eles:visible}).run()}cy.fit(visible,45)}
function elements(){const ids=new Set(data.nodes.map(n=>n.id)),out=data.nodes.map(n=>({data:{...n,label:(keystones.has(n.id)?'★ ':'')+n.name,color:colors[n.stage]||"#7b8794"},classes:keystones.has(n.id)?'key':''}));
// an edge is "implied" when a longer dependency path already connects the same pair — real input, redundant for sequencing
const down=new Map();for(const n of data.nodes)for(const d of n.dependsOn||[])if(ids.has(d)){if(!down.has(d))down.set(d,[]);down.get(d).push(n.id)}
const reach=(src,dst)=>{const stack=(down.get(src)||[]).filter(x=>x!==dst),seen=new Set(stack);while(stack.length){const c=stack.pop();if(c===dst)return true;for(const x of down.get(c)||[])if(!seen.has(x)){seen.add(x);stack.push(x)}}return false};
for(const n of data.nodes)for(const d of n.dependsOn||[])if(ids.has(d))out.push({data:{id:`${d}__${n.id}`,source:d,target:n.id,implied:reach(d,n.id)?1:0}});return out}
function init(){cy=cytoscape({container:document.getElementById('cy'),elements:elements(),wheelSensitivity:.18,minZoom:.2,maxZoom:2.5,style:[
{selector:'node',style:{'background-color':'data(color)','label':'data(label)','color':'#fff','font-size':10,'text-wrap':'wrap','text-max-width':120,'text-valign':'center','text-halign':'center','width':145,'height':46,'shape':'round-rectangle','border-width':1,'border-color':'#fff','padding':6}},
{selector:'node[type="external-input"]',style:{'shape':'round-tag','width':132,'height':38,'font-size':9,'opacity':.9}},
{selector:'node[requirement="conditional"]',style:{'border-style':'dashed','border-width':3}},
{selector:'edge',style:{'width':1.4,'line-color':'#98a2ad','target-arrow-color':'#98a2ad','target-arrow-shape':'triangle','curve-style':'bezier','arrow-scale':.8,'opacity':.55}},
{selector:'.key',style:{'border-width':3,'border-color':'#ffd166','width':162,'height':52,'font-size':11,'z-index':10}},
{selector:'.done',style:{'border-color':'#2e7d32','border-width':4}},
{selector:'.faded',style:{'opacity':.08,'text-opacity':.08}},{selector:'.selected',style:{'border-color':'#ffb000','border-width':5,'opacity':1,'z-index':999}},
{selector:'.upstream',style:{'background-color':'#2e7d32','line-color':'#2e7d32','target-arrow-color':'#2e7d32','opacity':1,'text-opacity':1}},
{selector:'.downstream',style:{'background-color':'#8e24aa','line-color':'#8e24aa','target-arrow-color':'#8e24aa','opacity':1,'text-opacity':1}}],layout:{name:'preset'}});
cy.on('tap','node',e=>select(e.target.id()));cy.on('tap',e=>{if(e.target===cy)clear()});runLayout()}
function details(id){const n=byId(id),up=(n.dependsOn||[]).map(byId).filter(Boolean),down=dependents(id),inf=(n.informedBy||[]).map(byId).filter(Boolean),stage=data.stages[n.stage]?.label||n.stage;const imp=importance[n.id];document.getElementById('details').innerHTML=`<h2>${keystones.has(id)?'★ ':''}${esc(n.name)}</h2><div class="meta">${esc(stage)} · ${n.type==='artifact'?'Artifact':'External input'}${keystones.has(id)?' · Keystone':''}</div><p>${esc(n.description)}</p>${imp?`<p class="meta">Flow centrality: #${imp.rank} of ${data.nodes.filter(x=>x.type==='artifact').length} artifacts · ${imp.a} upstream · ${imp.de} downstream</p>`:''}${documented.has(id)?`<p><a class="doclink" href="docs/artifact.html?id=${encodeURIComponent(id)}" target="_blank" rel="noreferrer">Open doc page ↗</a></p>`:''}${statusControls(n)}<h3>Author</h3>${pills(n.author)}${n.type==='external-input'?`<h3>Internal owner (gathers this)</h3>${pills(n.owner)}`:''}<h3>Source</h3>${pills(n.source)}<h3>Needed by</h3>${pills(n.neededBy)}<h3>Requirement</h3>${pills([n.requirement||'required'])}<h3>Evidence links</h3>${(n.evidenceLinks||[]).length?`<ul>${n.evidenceLinks.map(x=>`<li><a target="_blank" rel="noreferrer" href="${esc(x.url||x)}">${esc(x.label||x.url||x)}</a></li>`).join('')}</ul>`:'<span class="empty">None attached</span>'}<h3>Depends on</h3>${up.length?`<ul>${up.map(x=>`<li><button data-node="${x.id}">${esc(x.name)}</button></li>`).join('')}</ul>`:'<span class="empty">None</span>'}<h3>Informed by</h3>${inf.length?`<ul>${inf.map(x=>`<li><button data-node="${x.id}">${esc(x.name)}</button></li>`).join('')}</ul>`:'<span class="empty">None</span>'}<h3>Enables</h3>${down.length?`<ul>${down.map(x=>`<li><button data-node="${x.id}">${esc(x.name)}</button></li>`).join('')}</ul>`:'<span class="empty">None</span>'}<p class="note">Green is upstream. Purple is downstream.</p>`;document.getElementById('details').querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>select(b.dataset.node));bindStatusControls()}
function select(id){const s=cy.getElementById(id);if(s.empty())return;selectedId=id;showTab('explore');cy.elements().removeClass('selected upstream downstream faded');const a=s.predecessors(),d=s.successors(),focus=s.union(a).union(d);cy.elements().difference(focus).addClass('faded');s.addClass('selected');a.addClass('upstream');d.addClass('downstream');details(id);cy.animate({fit:{eles:focus,padding:70},duration:250})}
function clear(){cy.elements().removeClass('selected upstream downstream faded');document.getElementById('details').innerHTML='<h2>Explore the chain</h2><p class="empty">Select an artifact to see what it depends on and what it enables.</p><p class="note">Edges point from prerequisite to dependent.</p>';filter(false)}
function matches(n){const q=document.getElementById('search').value.trim().toLowerCase(),stage=document.getElementById('stage').value,author=document.getElementById('author').value,consumer=document.getElementById('consumer').value,req=document.getElementById('requirement').value,show=document.getElementById('showExternal').checked;if(!show&&n.type==='external-input')return false;if(stage&&n.stage!==stage)return false;
// author filter: artifacts the role produces, plus externals the role owns gathering
if(author&&!(n.author||[]).includes(author)&&!(n.owner||[]).includes(author))return false;
if(consumer&&!(n.neededBy||[]).includes(consumer))return false;if(req&&n.requirement!==req)return false;if(q){const h=[n.name,n.description,...(n.author||[]),...(n.source||[]),...(n.neededBy||[])].join(' ').toLowerCase();if(!h.includes(q))return false}return true}
function filter(layout=true){const visible=new Set(data.nodes.filter(matches).map(n=>n.id)),hideImp=document.getElementById('hideImplied').checked;cy.nodes().forEach(n=>n.style('display',visible.has(n.id())?'element':'none'));cy.edges().forEach(e=>e.style('display',visible.has(e.source().id())&&visible.has(e.target().id())&&!(hideImp&&e.data('implied'))?'element':'none'));if(layout)runLayout()}
async function boot(){const r=await fetch('artifacts.json');if(!r.ok)throw Error(`Could not load artifacts.json (${r.status})`);data=await r.json();const fill=(id,vals)=>{const sel=document.getElementById(id);for(const v of vals){const o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)}};
fill('consumer',[...new Set(data.nodes.flatMap(n=>n.neededBy||[]))].sort());
fill('author',[...new Set(data.nodes.flatMap(n=>[...(n.author||[]),...(n.owner||[])]))].sort());computeDepths();computeImportance();loadProject();init();renderProject();refreshDone();
fetch('docs/content.json').then(r=>r.ok?r.json():{}).then(j=>{documented=new Set(Object.keys(j))}).catch(()=>{});
document.getElementById('tabExplore').onclick=()=>showTab('explore');document.getElementById('tabProject').onclick=()=>showTab('project');
for(const id of ['search','stage','author','consumer','requirement','showExternal','hideImplied','layout']){document.getElementById(id).addEventListener('input',()=>filter());document.getElementById(id).addEventListener('change',()=>filter())}document.getElementById('fit').onclick=()=>cy.fit(cy.elements(':visible'),45);document.getElementById('clear').onclick=clear;filter()}
boot().catch(e=>{document.getElementById('cy').innerHTML=`<p style="padding:20px">${esc(e.message)}. Serve this folder through a local web server.</p>`;console.error(e)});