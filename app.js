const SUPABASE_URL = "https://dalmbojtmewamdvyopfh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VxVvixDgPN7dnrfoPbCQpw_et5ZeR8t";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null;
let adminStatus = false;
let teams = [];
let tasks = [];
let requirements = [];
let progress = [];

const $ = (id) => document.getElementById(id);

function isAdmin() { return adminStatus === true; }

function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

async function refreshAdminStatus() {
  adminStatus = false;
  if (!session?.user?.id) return false;
  const { data, error } = await db.from("admin_users").select("user_id")
    .eq("user_id", session.user.id).maybeSingle();
  if (!error && data) adminStatus = true;
  return adminStatus;
}

function ensureLoginModal() {
  if ($("loginModal")) return;
  const m = document.createElement("div");
  m.id = "loginModal";
  m.innerHTML = `<div class="login-backdrop"></div>
  <div class="login-dialog"><button id="loginClose" class="login-close">×</button>
  <h2>Admin Login</h2><p>Sign in with your bingo administrator account.</p>
  <label>Email</label><input id="loginEmail" type="email" autocomplete="username">
  <label>Password</label><div class="password-wrap"><input id="loginPassword" type="password" autocomplete="current-password"><button id="togglePassword">Show</button></div>
  <div id="loginError" class="login-error" hidden></div>
  <div class="login-actions"><button id="loginCancel">Cancel</button><button id="loginSubmit">Log In</button></div></div>`;
  document.body.appendChild(m);
  const s=document.createElement("style"); s.textContent=`#loginModal{display:none;position:fixed;inset:0;z-index:99999}#loginModal.open{display:block}.login-backdrop{position:absolute;inset:0;background:#000b}.login-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,430px);padding:28px;background:#20242b;color:#fff;border-radius:12px;box-shadow:0 20px 70px #0009}.login-dialog input{box-sizing:border-box;width:100%;padding:11px;margin:6px 0 12px;background:#111;color:#fff;border:1px solid #555;border-radius:6px}.password-wrap{display:flex;gap:8px}.password-wrap input{flex:1}.login-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.login-actions button,.password-wrap button{padding:9px 14px;border:0;border-radius:6px;cursor:pointer}.login-close{position:absolute;right:10px;top:8px;background:none;border:0;color:#aaa;font-size:25px;cursor:pointer}.login-error{padding:9px;background:#521f24;border-radius:6px;color:#ffb5b5}`;document.head.appendChild(s);
  $("loginClose").onclick=closeLogin;$("loginCancel").onclick=closeLogin;
  $("loginModal").querySelector(".login-backdrop").onclick=closeLogin;
  $("togglePassword").onclick=()=>{const p=$("loginPassword");p.type=p.type==="password"?"text":"password";$("togglePassword").textContent=p.type==="password"?"Show":"Hide"};
  $("loginSubmit").onclick=login;
  $("loginPassword").onkeydown=e=>{if(e.key==="Enter")login()};
}
function openLogin(){ensureLoginModal();$("loginModal").classList.add("open");$("loginEmail").focus()}
function closeLogin(){if($("loginModal"))$("loginModal").classList.remove("open")}

async function login(){
  const email=$("loginEmail").value.trim(), password=$("loginPassword").value, err=$("loginError"), btn=$("loginSubmit");
  err.hidden=true;
  if(!email||!password){err.textContent="Enter both email and password.";err.hidden=false;return}
  btn.disabled=true;btn.textContent="Logging in…";
  try{
    const {data,error}=await db.auth.signInWithPassword({email,password});
    if(error)throw error;
    session=data.session;await refreshAdminStatus();
    if(!isAdmin()){await db.auth.signOut();session=null;throw new Error("This account can sign in, but is not listed as a bingo administrator.")}
    closeLogin();updateAuthUI();await loadAll();
  }catch(e){err.textContent=e.message||"Login failed.";err.hidden=false}
  finally{btn.disabled=false;btn.textContent="Log In"}
}

function updateAuthUI(){
  if($("loginBtn"))$("loginBtn").style.display=session?"none":"";
  if($("logoutBtn"))$("logoutBtn").style.display=session?"":"none";
  document.querySelectorAll(".admin-only").forEach(e=>e.style.display=isAdmin()?"":"none");
}

async function loadAll(){
  const [a,b,c,d]=await Promise.all([
    db.from("teams").select("*").order("created_at"),
    db.from("tasks").select("*").order("position"),
    db.from("task_requirements").select("*").order("sort_order"),
    db.from("task_progress").select("*")
  ]);
  if(a.error)console.error(a.error);if(b.error)console.error(b.error);if(c.error)console.error(c.error);if(d.error)console.error(d.error);
  teams=a.data||[];tasks=b.data||[];requirements=c.data||[];progress=d.data||[];
  render();
}

function teamProgress(taskId, teamId){
  const reqs=requirements.filter(r=>r.task_id===taskId);
  const vals=reqs.map(r=>({r,p:progress.find(x=>x.team_id===teamId&&x.requirement_id===r.id)?.quantity||0}));
  if(!vals.length)return {complete:false,vals:[],percent:0};
  const groups=[...new Set(vals.map(x=>x.r.requirement_group))];
  const groupResults=groups.map(g=>{
    const items=vals.filter(x=>x.r.requirement_group===g);
    return items[0].r.group_mode==="ANY"
      ? items.some(x=>x.p>=Number(x.r.required_quantity))
      : items.every(x=>x.p>=Number(x.r.required_quantity));
  });
  const complete=groupResults.every(Boolean);
  const percent=Math.min(100,Math.round(vals.reduce((s,x)=>s+Math.min(1,x.p/Number(x.r.required_quantity)),0)/vals.length*100));
  return {complete,vals,percent};
}

function render(){
  renderTeams();renderBoard();renderLeaderboard();renderAdminTaskList();updateAuthUI();
}

function renderTeams(){
  const s=$("activeTeam");if(!s)return;
  const old=s.value;s.innerHTML="";
  teams.forEach(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=t.name;s.appendChild(o)});
  if(teams.some(t=>String(t.id)===String(old)))s.value=old;
}

function renderBoard(){
  const b=$("bingoBoard");if(!b)return;
  const teamId=$("activeTeam")?.value;if(!teamId){b.innerHTML="";return}
  b.innerHTML="";
  tasks.slice(0,25).forEach(t=>{
    const state=teamProgress(t.id,teamId);
    const tile=document.createElement("div");tile.className="bingo-tile"+(state.complete?" completed":"");
    const lines=state.vals.map(x=>`${esc(x.r.label)}: ${Number(x.p)} / ${Number(x.r.required_quantity)} ${esc(x.r.unit)}`).join("<br>");
    tile.innerHTML=`<strong>${t.position}.</strong><span>${esc(t.name)}</span><div class="tile-progress">${state.complete?"✓ COMPLETE":state.percent+"%"}<br><small>${lines}</small></div>`;
    tile.onclick=()=>openProgressEditor(t,state,teamId);
    b.appendChild(tile);
  });
}

function renderLeaderboard(){
  const b=$("leaderboard");if(!b)return;
  b.innerHTML=teams.map(t=>{
    const states=tasks.map(x=>teamProgress(x.id,t.id));
    return `<div class="leaderboard-row"><span>${esc(t.name)}</span><span>${states.filter(x=>x.complete).length}/${tasks.length} tiles</span></div>`;
  }).join("");
}

function renderAdminTaskList(){
  const l=$("taskList");if(!l||!isAdmin())return;
  l.innerHTML=tasks.map(t=>`<div class="task-row"><strong>${t.position}.</strong> ${esc(t.name)} <button onclick="editRequirements(${t.id})">Edit Quantities</button></div>`).join("");
}

async function openProgressEditor(task,state,teamId){
  let html=`<div style="padding:20px"><h2>${esc(task.name)}</h2>`;
  state.vals.forEach(x=>{
    html+=`<label style="display:block;margin-top:12px">${esc(x.r.label)} — ${Number(x.r.required_quantity)} ${esc(x.r.unit)}
      <input data-req="${x.r.id}" type="number" min="0" step="1" value="${Number(x.p)}" style="width:100%;box-sizing:border-box;padding:8px;margin-top:4px">
    </label>`;
  });
  html+=`<button id="saveProgress" style="margin-top:18px">Save Progress</button></div>`;
  let modal=$("progressModal");
  if(!modal){modal=document.createElement("div");modal.id="progressModal";document.body.appendChild(modal)}
  modal.style.cssText="position:fixed;inset:0;z-index:99998;background:#000b;display:flex;align-items:center;justify-content:center";
  modal.innerHTML=`<div style="background:#20242b;color:#fff;padding:24px;border-radius:10px;width:min(90vw,600px);max-height:85vh;overflow:auto">${html}<button id="closeProgress" style="margin-top:10px">Close</button></div>`;
  $("closeProgress").onclick=()=>modal.remove();
  $("saveProgress").onclick=async()=>{
    for(const input of modal.querySelectorAll("[data-req]")){
      const requirement_id=Number(input.dataset.req),quantity=Number(input.value)||0;
      const existing=progress.find(x=>x.team_id===teamId&&x.requirement_id===requirement_id);
      const payload={team_id:teamId,requirement_id,quantity,submitted_by:session?.user?.email||null,updated_at:new Date().toISOString()};
      const res=existing
        ? await db.from("task_progress").update(payload).eq("id",existing.id)
        : await db.from("task_progress").insert(payload);
      if(res.error){alert(res.error.message);return}
    }
    modal.remove();await loadAll();
  };
}

async function editRequirements(taskId){
  if(!isAdmin())return;
  const reqs=requirements.filter(r=>r.task_id===taskId);
  for(const r of reqs){
    const q=prompt(`Required quantity for "${r.label}" (${r.unit}):`,r.required_quantity);
    if(q===null)continue;
    const n=Number(q);if(!Number.isFinite(n)||n<0){alert("Enter a valid non-negative number.");continue}
    const {error}=await db.from("task_requirements").update({required_quantity:n}).eq("id",r.id);
    if(error)alert(error.message);
  }
  await loadAll();
}
window.editRequirements=editRequirements;

async function init(){
  ensureLoginModal();
  const {data}=await db.auth.getSession();session=data.session;
  if(session)await refreshAdminStatus();
  updateAuthUI();await loadAll();
  if($("loginBtn"))$("loginBtn").onclick=openLogin;
  if($("logoutBtn"))$("logoutBtn").onclick=async()=>{await db.auth.signOut();session=null;adminStatus=false;updateAuthUI();await loadAll()};
  if($("activeTeam"))$("activeTeam").onchange=renderBoard;
  db.auth.onAuthStateChange(async(_e,s)=>{session=s;if(session)await refreshAdminStatus();else adminStatus=false;updateAuthUI();await loadAll()});
  db.channel("bingo-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"teams"},loadAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},loadAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"task_requirements"},loadAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"task_progress"},loadAll)
    .subscribe();
}
init();

init();
