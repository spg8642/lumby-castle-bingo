// Lumby Castle Bingo Tracker — password admin login
const SUPABASE_URL = "https://dalmbojtmewamdvyopfh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VxVvixDgPN7dnrfoPbCQpw_et5ZeR8t";

const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
const db = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let state = { teams: [], tasks: [], completions: [] };
let activeTeamId = null;
let session = null;
let adminStatus = false;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function setSetupNotice(msg, show=true) {
  $("setupNotice").innerHTML = msg;
  $("setupNotice").classList.toggle("hidden", !show);
}

function isAdmin() {
  return !!session?.user && adminStatus === true;
}

async function refreshAdminStatus() {
  adminStatus = false;
  if (!session?.user || !db) return;

  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!error && data) adminStatus = true;
  if (error) console.warn("Admin check:", error.message);
}

async function updateAuthUI() {
  await refreshAdminStatus();
  $("loginBtn").classList.toggle("hidden", !!session);
  $("logoutBtn").classList.toggle("hidden", !session);
  document.querySelectorAll(".admin-only")
    .forEach(e => e.classList.toggle("hidden", !adminStatus));
}

async function init() {
  if (!configured) {
    setSetupNotice("<strong>Setup required:</strong> Replace SUPABASE_ANON_KEY in <code>app.js</code> with your real public/publishable key.");
    renderEmpty();
    return;
  }

  setSetupNotice("", false);

  const { data: { session: s } } = await db.auth.getSession();
  session = s;
  await updateAuthUI();
  await loadAll();

  db.channel("bingo-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"teams" }, loadAll)
    .on("postgres_changes", { event:"*", schema:"public", table:"tasks" }, loadAll)
    .on("postgres_changes", { event:"*", schema:"public", table:"completions" }, loadAll)
    .subscribe();

  db.auth.onAuthStateChange(async (_event, s) => {
    session = s;
    await updateAuthUI();
    render();
  });
}

async function loadAll() {
  const [teams, tasks, comps] = await Promise.all([
    db.from("teams").select("*").order("created_at"),
    db.from("tasks").select("*").order("position"),
    db.from("completions").select("*")
  ]);

  for (const r of [teams, tasks, comps]) {
    if (r.error) {
      setSetupNotice("<strong>Database error:</strong> " + esc(r.error.message));
      return;
    }
  }

  state = {
    teams: teams.data || [],
    tasks: tasks.data || [],
    completions: comps.data || []
  };

  if (!activeTeamId && state.teams[0]) activeTeamId = state.teams[0].id;
  if (activeTeamId && !state.teams.some(t => t.id === activeTeamId)) {
    activeTeamId = state.teams[0]?.id || null;
  }
  render();
}

function renderEmpty() {
  $("teamSelect").innerHTML = "";
  $("board").innerHTML = "<div class='status'>Connect Supabase to load the bingo board.</div>";
}

function activeTeam() {
  return state.teams.find(t => t.id === activeTeamId);
}

function comp(teamId, taskId) {
  return state.completions.find(c => c.team_id === teamId && c.task_id === taskId);
}

function render() {
  const t = activeTeam();

  $("teamSelect").innerHTML = state.teams.map(x =>
    `<option value="${x.id}" ${x.id === activeTeamId ? "selected" : ""}>${esc(x.name)}</option>`
  ).join("");

  if (!t) {
    renderEmpty();
    return;
  }

  const rows = state.completions.filter(c => c.team_id === t.id);
  const completed = rows.filter(c => c.completed).length;
  const verified = rows.filter(c => c.verified).length;
  const pct = Math.round(completed / 25 * 100);

  $("teamName").textContent = t.name;
  $("teamPlayers").textContent = `${t.player1} + ${t.player2}`;
  $("completedCount").textContent = `${completed}/25`;
  $("verifiedCount").textContent = `${verified}/25`;
  $("progressPct").textContent = pct + "%";
  $("progressPct").parentElement.style.setProperty("--pct", pct + "%");
  $("bingoCount").textContent = bingoLines(t.id);
  $("pointsCount").textContent = rows
    .filter(c => c.verified)
    .reduce((a,c) => a + (state.tasks.find(x => x.id === c.task_id)?.points || 0), 0);
  $("lastUpdated").textContent = "Live";

  renderBoard(t.id);
  renderLeaderboard();
  renderTaskEditor();
}

function bingoLines(teamId) {
  const done = new Set(
    state.completions
      .filter(c => c.team_id === teamId && c.verified)
      .map(c => state.tasks.findIndex(x => x.id === c.task_id))
  );

  let n = 0;
  const lines = [];

  for (let r=0; r<5; r++) lines.push([0,1,2,3,4].map(c => r*5+c));
  for (let c=0; c<5; c++) lines.push([0,1,2,3,4].map(r => r*5+c));
  lines.push([0,6,12,18,24], [4,8,12,16,20]);

  lines.forEach(l => { if (l.every(i => done.has(i))) n++; });
  return n;
}

function renderBoard(teamId) {
  $("board").innerHTML = state.tasks.slice(0,25).map((task,i) => {
    const c = comp(teamId, task.id) || {};
    return `<button class="tile ${c.completed ? "completed" : ""} ${c.verified ? "verified" : ""}" data-task="${task.id}">
      <span class="num">#${i+1}</span>
      <span class="task">${esc(task.name)}</span>
      <span class="points">${task.points} pts${c.verified ? " • VERIFIED" : c.completed ? " • COMPLETED" : ""}</span>
    </button>`;
  }).join("");

  document.querySelectorAll(".tile").forEach(b =>
    b.onclick = () => openTask(b.dataset.task)
  );
}

function renderLeaderboard() {
  const data = state.teams.map(t => {
    const cs = state.completions.filter(c => c.team_id === t.id && c.verified);
    const pts = cs.reduce((a,c) =>
      a + (state.tasks.find(x => x.id === c.task_id)?.points || 0), 0);

    return {
      ...t,
      completed: state.completions.filter(c => c.team_id === t.id && c.completed).length,
      points: pts,
      bingo: bingoLines(t.id)
    };
  }).sort((a,b) => b.points - a.points || b.completed - a.completed);

  $("leaderboardRows").innerHTML = data.map((t,i) =>
    `<div class="leader-row">
      <strong>${i+1}</strong>
      <div><strong>${esc(t.name)}</strong><small>${esc(t.player1)} + ${esc(t.player2)}</small></div>
      <strong>${t.points} pts</strong>
      <strong>${t.completed}/25</strong>
    </div>`
  ).join("") || "<div class='status'>No teams yet.</div>";
}

function renderTaskEditor() {
  if (!isAdmin()) return;

  $("taskEditor").innerHTML = state.tasks.map((t,i) =>
    `<div class="task-editor">
      <span>#${i+1}</span>
      <input data-id="${t.id}" class="task-name" value="${esc(t.name)}">
      <input data-id="${t.id}" class="task-points" type="number" min="0" value="${t.points}">
      <button data-id="${t.id}" class="save-task">Save</button>
    </div>`
  ).join("");

  document.querySelectorAll(".save-task").forEach(b => b.onclick = async () => {
    const id = b.dataset.id;
    const name = document.querySelector(`.task-name[data-id="${id}"]`).value.trim();
    const points = Number(document.querySelector(`.task-points[data-id="${id}"]`).value) || 0;
    const { error } = await db.from("tasks").update({name, points}).eq("id", id);
    if (error) alert(error.message);
  });
}

function openTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  const c = comp(activeTeamId, taskId) || {};

  $("modalTitle").textContent = task.name;
  $("modalBody").innerHTML = `
    <p class="status"><strong>${task.points} points</strong><br>
    Status: ${c.verified ? "Verified" : c.completed ? "Completed / awaiting verification" : "Not completed"}</p>
    <div class="modal-actions">
      <button id="completeBtn">${c.completed ? "Undo Completion" : "Mark Completed"}</button>
      ${isAdmin() ? `<button id="verifyBtn">${c.verified ? "Unverify" : "Verify Completion"}</button>` : ""}
    </div>`;

  $("modal").classList.remove("hidden");

  $("completeBtn").onclick = () =>
    setCompletion(taskId, !c.completed, c.verified);

  if (isAdmin()) {
    $("verifyBtn").onclick = () =>
      setCompletion(taskId, true, !c.verified);
  }
}

async function setCompletion(taskId, completed, verified) {
  if (!session) {
    alert("Please log in before changing task status.");
    return;
  }

  const existing = comp(activeTeamId, taskId);
  const payload = {
    team_id: activeTeamId,
    task_id: taskId,
    completed,
    verified: verified && isAdmin(),
    updated_by: session.user.id
  };

  const result = existing
    ? await db.from("completions").update(payload).eq("id", existing.id)
    : await db.from("completions").insert(payload);

  if (result.error) alert(result.error.message);
  else {
    $("modal").classList.add("hidden");
    await loadAll();
  }
}

$("teamSelect").onchange = e => {
  activeTeamId = e.target.value;
  render();
};

$("closeModal").onclick = () => $("modal").classList.add("hidden");

$("loginBtn").onclick = async () => {
  const email = prompt("Admin email:");
  if (!email) return;

  const password = prompt("Admin password:");
  if (!password) return;

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  session = (await db.auth.getSession()).data.session;
  await updateAuthUI();
  await loadAll();

  if (!isAdmin()) {
    alert("Login succeeded, but this account is not listed as a bingo administrator.");
  }
};

$("logoutBtn").onclick = async () => {
  await db.auth.signOut();
  session = null;
  adminStatus = false;
  await updateAuthUI();
  render();
};

$("addTeamBtn").onclick = async () => {
  if (!isAdmin()) return;
  const name = prompt("Team name:");
  if (!name) return;
  const p1 = prompt("Player 1:") || "";
  const p2 = prompt("Player 2:") || "";
  const { error } = await db.from("teams").insert({name, player1:p1, player2:p2});
  if (error) alert(error.message);
};

$("editTeamBtn").onclick = async () => {
  if (!isAdmin()) return;
  const t = activeTeam();
  if (!t) return;
  const name = prompt("Team name:", t.name) || t.name;
  const p1 = prompt("Player 1:", t.player1) || t.player1;
  const p2 = prompt("Player 2:", t.player2) || t.player2;
  const { error } = await db.from("teams").update({name,player1:p1,player2:p2}).eq("id",t.id);
  if (error) alert(error.message);
};

$("deleteTeamBtn").onclick = async () => {
  if (!isAdmin()) return;
  const t = activeTeam();
  if (t && confirm(`Delete ${t.name}?`)) {
    const { error } = await db.from("teams").delete().eq("id",t.id);
    if (error) alert(error.message);
  }
};

$("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bingo-backup.json";
  a.click();
};

$("importInput").onchange = async e => {
  alert("Import is intentionally disabled in this starter setup. Use Supabase backups/SQL for authoritative restores.");
  e.target.value = "";
};

$("resetBtn").onclick = async () => {
  if (!isAdmin() || !confirm("Reset all completion statuses?")) return;
  const { error } = await db.from("completions").delete().neq("id","00000000-0000-0000-0000-000000000000");
  if (error) alert(error.message);
  else await loadAll();
};

init();
