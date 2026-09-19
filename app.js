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

function isAdmin() {
  return adminStatus === true;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(message) {
  console.error(message);
  const notice = $("setupNotice");
  if (notice) {
    notice.style.display = "";
    notice.innerHTML = `<strong>Connection error:</strong> ${esc(message)}`;
  }
}

async function refreshAdminStatus() {
  adminStatus = false;

  if (!session?.user?.id) return false;

  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!error && data) adminStatus = true;

  return adminStatus;
}

function ensureLoginModal() {
  if ($("loginModal")) return;

  const m = document.createElement("div");
  m.id = "loginModal";

  m.innerHTML = `
    <div class="login-backdrop"></div>
    <div class="login-dialog">
      <button id="loginClose" class="login-close" type="button">×</button>
      <h2>Admin Login</h2>
      <p>Sign in with your bingo administrator account.</p>

      <label for="loginEmail">Email</label>
      <input id="loginEmail" type="email" autocomplete="username">

      <label for="loginPassword">Password</label>
      <div class="password-wrap">
        <input id="loginPassword" type="password" autocomplete="current-password">
        <button id="togglePassword" type="button">Show</button>
      </div>

      <div id="loginError" class="login-error" hidden></div>

      <div class="login-actions">
        <button id="loginCancel" type="button">Cancel</button>
        <button id="loginSubmit" type="button">Log In</button>
      </div>
    </div>
  `;

  document.body.appendChild(m);

  const s = document.createElement("style");
  s.textContent = `
    #loginModal {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 99999;
    }

    #loginModal.open {
      display: block;
    }

    .login-backdrop {
      position: absolute;
      inset: 0;
      background: #000b;
    }

    .login-dialog {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 430px);
      padding: 28px;
      background: #20242b;
      color: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 70px #0009;
    }

    .login-dialog input {
      box-sizing: border-box;
      width: 100%;
      padding: 11px;
      margin: 6px 0 12px;
      background: #111;
      color: #fff;
      border: 1px solid #555;
      border-radius: 6px;
    }

    .password-wrap {
      display: flex;
      gap: 8px;
    }

    .password-wrap input {
      flex: 1;
    }

    .login-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
    }

    .login-actions button,
    .password-wrap button {
      padding: 9px 14px;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
    }

    .login-close {
      position: absolute;
      right: 10px;
      top: 8px;
      background: none;
      border: 0;
      color: #aaa;
      font-size: 25px;
      cursor: pointer;
    }

    .login-error {
      padding: 9px;
      background: #521f24;
      border-radius: 6px;
      color: #ffb5b5;
      margin-top: 8px;
    }

    .progress-modal {
      position: fixed;
      inset: 0;
      z-index: 99998;
      background: #000b;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progress-dialog {
      background: #20242b;
      color: #fff;
      padding: 24px;
      border-radius: 10px;
      width: min(90vw, 650px);
      max-height: 85vh;
      overflow: auto;
      box-shadow: 0 20px 70px #0009;
    }

    .progress-dialog input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      margin-top: 4px;
      background: #111;
      color: #fff;
      border: 1px solid #555;
      border-radius: 5px;
    }

    .progress-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 18px;
    }

    .requirement-row {
      padding: 10px 0;
      border-bottom: 1px solid #3a3f48;
    }

    .requirement-row:last-child {
      border-bottom: 0;
    }

    .task-row {
      padding: 10px 0;
      border-bottom: 1px solid #ddd2;
    }

    .task-row button {
      margin-left: 8px;
    }

    .tile-progress small {
      line-height: 1.45;
    }
  `;
  document.head.appendChild(s);

  $("loginClose").onclick = closeLogin;
  $("loginCancel").onclick = closeLogin;
  $("loginModal").querySelector(".login-backdrop").onclick = closeLogin;

  $("togglePassword").onclick = () => {
    const p = $("loginPassword");
    p.type = p.type === "password" ? "text" : "password";
    $("togglePassword").textContent = p.type === "password" ? "Show" : "Hide";
  };

  $("loginSubmit").onclick = login;

  $("loginPassword").onkeydown = (e) => {
    if (e.key === "Enter") login();
  };
}

function openLogin() {
  ensureLoginModal();
  $("loginModal").classList.add("open");
  $("loginEmail").focus();
}

function closeLogin() {
  if ($("loginModal")) $("loginModal").classList.remove("open");
}

async function login() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const err = $("loginError");
  const btn = $("loginSubmit");

  err.hidden = true;

  if (!email || !password) {
    err.textContent = "Enter both email and password.";
    err.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Logging in…";

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    session = data.session;
    await refreshAdminStatus();

    if (!isAdmin()) {
      await db.auth.signOut();
      session = null;
      throw new Error(
        "This account can sign in, but is not listed as a bingo administrator."
      );
    }

    closeLogin();
    updateAuthUI();
    await loadAll();
  } catch (e) {
    err.textContent = e.message || "Login failed.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Log In";
  }
}

function updateAuthUI() {
  if ($("loginBtn")) $("loginBtn").style.display = session ? "none" : "";
  if ($("logoutBtn")) $("logoutBtn").style.display = session ? "" : "none";

  document.querySelectorAll(".admin-only").forEach((e) => {
    e.style.display = isAdmin() ? "" : "none";
  });
}

async function loadAll() {
  const [a, b, c, d] = await Promise.all([
    db.from("teams").select("*").order("created_at"),
    db.from("tasks").select("*").order("position"),
    db.from("task_requirements").select("*").order("sort_order"),
    db.from("task_progress").select("*")
  ]);

  if (a.error) console.error("Teams:", a.error);
  if (b.error) console.error("Tasks:", b.error);
  if (c.error) console.error("Requirements:", c.error);
  if (d.error) console.error("Progress:", d.error);

  if (a.error || b.error || c.error || d.error) {
    const firstError = a.error || b.error || c.error || d.error;
    showError(firstError.message || "Unable to load bingo data.");
    return;
  }

  teams = a.data || [];
  tasks = b.data || [];
  requirements = c.data || [];
  progress = d.data || [];

  const notice = $("setupNotice");
  if (notice) notice.style.display = "none";

  render();
}

function requirementProgress(req, teamId) {
  const p = progress.find(
    (x) =>
      String(x.team_id) === String(teamId) &&
      String(x.requirement_id) === String(req.id)
  );

  return Number(p?.quantity || 0);
}

function teamProgress(taskId, teamId) {
  const reqs = requirements.filter(
    (r) => String(r.task_id) === String(taskId)
  );

  if (!reqs.length) {
    return {
      complete: false,
      vals: [],
      percent: 0,
      groupResults: []
    };
  }

  const vals = reqs.map((r) => ({
    r,
    p: requirementProgress(r, teamId)
  }));

  const groupIds = [
    ...new Set(vals.map((x) => Number(x.r.requirement_group || 1)))
  ];

  const groupResults = groupIds.map((g) => {
    const items = vals.filter(
      (x) => Number(x.r.requirement_group || 1) === g
    );

    const mode = String(items[0]?.r.group_mode || "ALL").toUpperCase();

    if (mode === "ANY") {
      return items.some(
        (x) => x.p >= Number(x.r.required_quantity || 0)
      );
    }

    return items.every(
      (x) => x.p >= Number(x.r.required_quantity || 0)
    );
  });

  const task = tasks.find((t) => String(t.id) === String(taskId));
  const overallMode = String(task?.completion_mode || "ALL").toUpperCase();

  const complete =
    overallMode === "ANY"
      ? groupResults.some(Boolean)
      : groupResults.every(Boolean);

  const percent = Math.min(
    100,
    Math.round(
      (vals.reduce((sum, x) => {
        const required = Number(x.r.required_quantity || 0);
        if (required <= 0) return sum + 1;
        return sum + Math.min(1, x.p / required);
      }, 0) /
        vals.length) *
        100
    )
  );

  return {
    complete,
    vals,
    percent,
    groupResults
  };
}

function render() {
  renderTeams();
  renderBoard();
  renderLeaderboard();
  renderAdminTaskList();
  updateAuthUI();
}

function renderTeams() {
  const s = $("activeTeam");
  if (!s) return;

  const old = s.value;
  s.innerHTML = "";

  teams.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.name;
    s.appendChild(o);
  });

  if (teams.some((t) => String(t.id) === String(old))) {
    s.value = old;
  }

  renderSelectedTeamSummary();
}

function renderSelectedTeamSummary() {
  const teamId = $("activeTeam")?.value;
  const team = teams.find((t) => String(t.id) === String(teamId));

  if (!team) return;

  if ($("teamName")) $("teamName").textContent = team.name;

  const players = Array.isArray(team.players)
    ? team.players
    : [team.player1, team.player2].filter(Boolean);

  if ($("teamPlayers")) {
    $("teamPlayers").textContent = players.length
      ? players.join(" • ")
      : "Players not listed";
  }

  const states = tasks.slice(0, 25).map((t) => teamProgress(t.id, team.id));
  const completed = states.filter((x) => x.complete).length;

  if ($("completedCount")) {
    $("completedCount").textContent = `${completed}/${Math.min(
      25,
      tasks.length
    )}`;
  }

  if ($("progressPct")) {
    const pct = states.length
      ? Math.round(
          states.reduce((sum, x) => sum + x.percent, 0) / states.length
        )
      : 0;
    $("progressPct").textContent = `${pct}%`;
  }

  if ($("verifiedCount")) {
    $("verifiedCount").textContent = "—";
  }

  if ($("bingoCount")) {
    $("bingoCount").textContent = calculateBingoLines(states);
  }

  if ($("pointsCount")) {
    $("pointsCount").textContent = states
      .filter((x) => x.complete)
      .reduce((sum, state, index) => {
        const task = tasks[index];
        return sum + Number(task?.points || 0);
      }, 0);
  }
}

function calculateBingoLines(states) {
  if (states.length < 25) return 0;

  let lines = 0;

  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => states[r * 5 + c]?.complete)) {
      lines++;
    }
  }

  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => states[r * 5 + c]?.complete)) {
      lines++;
    }
  }

  if ([0, 6, 12, 18, 24].every((i) => states[i]?.complete)) lines++;
  if ([4, 8, 12, 16, 20].every((i) => states[i]?.complete)) lines++;

  return lines;
}

function renderBoard() {
  const b = $("bingoBoard");
  if (!b) return;

  const teamId = $("activeTeam")?.value;

  if (!teamId) {
    b.innerHTML = "";
    return;
  }

  b.innerHTML = "";

  tasks.slice(0, 25).forEach((t) => {
    const state = teamProgress(t.id, teamId);

    const tile = document.createElement("div");
    tile.className =
      "bingo-tile" + (state.complete ? " completed" : "");

    const lines = state.vals
      .map(
        (x) =>
          `${esc(x.r.label)}: ${Number(x.p)} / ${Number(
            x.r.required_quantity
          )} ${esc(x.r.unit)}`
      )
      .join("<br>");

    tile.innerHTML = `
      <strong>${t.position}.</strong>
      <span>${esc(t.name)}</span>
      <div class="tile-progress">
        ${state.complete ? "✓ COMPLETE" : state.percent + "%"}
        <br>
        <small>${lines}</small>
      </div>
    `;

    tile.onclick = () => openProgressEditor(t, state, teamId);

    b.appendChild(tile);
  });

  renderSelectedTeamSummary();
}

function renderLeaderboard() {
  const b = $("leaderboard");
  if (!b) return;

  const rows = teams.map((t) => {
    const states = tasks.slice(0, 25).map((x) =>
      teamProgress(x.id, t.id)
    );

    const completed = states.filter((x) => x.complete).length;

    const percent = states.length
      ? Math.round(
          states.reduce((sum, x) => sum + x.percent, 0) /
            states.length
        )
      : 0;

    const points = states.reduce((sum, state, index) => {
      return (
        sum +
        (state.complete ? Number(tasks[index]?.points || 0) : 0)
      );
    }, 0);

    return {
      name: t.name,
      completed,
      percent,
      points
    };
  });

  rows.sort((a, b) => {
    if (b.completed !== a.completed)
      return b.completed - a.completed;
    return b.percent - a.percent;
  });

  b.innerHTML = rows
    .map(
      (r, i) => `
        <div class="leaderboard-row">
          <span>${i + 1}. ${esc(r.name)}</span>
          <span>${r.completed}/25 tiles • ${r.percent}% • ${r.points} pts</span>
        </div>
      `
    )
    .join("");

  if ($("lastUpdated")) {
    $("lastUpdated").textContent =
      "Updated " + new Date().toLocaleTimeString();
  }
}

function renderAdminTaskList() {
  const l = $("taskList");
  if (!l || !isAdmin()) return;

  l.innerHTML = tasks
    .slice(0, 25)
    .map(
      (t) => `
        <div class="task-row">
          <strong>${t.position}.</strong>
          ${esc(t.name)}
          <button type="button" data-edit-task="${esc(t.id)}">
            Edit Quantities
          </button>
        </div>
      `
    )
    .join("");

  l.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.onclick = () => editRequirements(button.dataset.editTask);
  });
}

function openProgressEditor(task, state, teamId) {
  let html = `
    <h2>${esc(task.name)}</h2>
    <p>Team: <strong>${esc(
      teams.find((t) => String(t.id) === String(teamId))?.name || ""
    )}</strong></p>
  `;

  state.vals.forEach((x) => {
    html += `
      <div class="requirement-row">
        <label>
          <strong>${esc(x.r.label)}</strong>
          <br>
          <small>
            Required: ${Number(x.r.required_quantity)} ${esc(
      x.r.unit
    )}
          </small>

          <input
            data-req="${esc(x.r.id)}"
            type="number"
            min="0"
            step="1"
            value="${Number(x.p)}"
          >
        </label>
      </div>
    `;
  });

  let modal = $("progressModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "progressModal";
    document.body.appendChild(modal);
  }

  modal.className = "progress-modal";

  modal.innerHTML = `
    <div class="progress-dialog">
      ${html}

      <div class="progress-actions">
        <button id="closeProgress" type="button">Close</button>
        <button id="saveProgress" type="button">Save Progress</button>
      </div>
    </div>
  `;

  $("closeProgress").onclick = () => modal.remove();

  $("saveProgress").onclick = async () => {
    const saveButton = $("saveProgress");
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";

    try {
      for (const input of modal.querySelectorAll("[data-req]")) {
        const requirement_id = input.dataset.req;
        const quantity = Math.max(0, Number(input.value) || 0);

        const existing = progress.find(
          (x) =>
            String(x.team_id) === String(teamId) &&
            String(x.requirement_id) === String(requirement_id)
        );

        const payload = {
          team_id: teamId,
          requirement_id,
          quantity,
          submitted_by: session?.user?.email || null,
          updated_at: new Date().toISOString()
        };

        const res = existing
          ? await db
              .from("task_progress")
              .update(payload)
              .eq("id", existing.id)
          : await db.from("task_progress").insert(payload);

        if (res.error) throw res.error;
      }

      modal.remove();
      await loadAll();
    } catch (e) {
      alert(e.message || "Unable to save progress.");
      saveButton.disabled = false;
      saveButton.textContent = "Save Progress";
    }
  };
}

function editRequirements(taskId) {
  if (!isAdmin()) return;

  const reqs = requirements.filter(
    (r) => String(r.task_id) === String(taskId)
  );

  let modal = $("progressModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "progressModal";
    document.body.appendChild(modal);
  }

  modal.className = "progress-modal";

  modal.innerHTML = `
    <div class="progress-dialog">
      <h2>Edit Task Quantities</h2>
      <p>Change the required quantity for each requirement.</p>

      ${reqs
        .map(
          (r) => `
            <div class="requirement-row">
              <label>
                <strong>${esc(r.label)}</strong>
                <br>
                <small>${esc(r.unit)}</small>
                <input
                  data-edit-req="${esc(r.id)}"
                  type="number"
                  min="0"
                  step="1"
                  value="${Number(r.required_quantity)}"
                >
              </label>
            </div>
          `
        )
        .join("")}

      <div class="progress-actions">
        <button id="cancelRequirementEdit" type="button">Cancel</button>
        <button id="saveRequirementEdit" type="button">Save Quantities</button>
      </div>
    </div>
  `;

  $("cancelRequirementEdit").onclick = () => modal.remove();

  $("saveRequirementEdit").onclick = async () => {
    const button = $("saveRequirementEdit");
    button.disabled = true;
    button.textContent = "Saving…";

    try {
      for (const input of modal.querySelectorAll("[data-edit-req]")) {
        const id = input.dataset.editReq;
        const quantity = Math.max(0, Number(input.value) || 0);

        const { error } = await db
          .from("task_requirements")
          .update({ required_quantity: quantity })
          .eq("id", id);

        if (error) throw error;
      }

      modal.remove();
      await loadAll();
    } catch (e) {
      alert(e.message || "Unable to save quantities.");
      button.disabled = false;
      button.textContent = "Save Quantities";
    }
  };
}

window.editRequirements = editRequirements;

async function init() {
  ensureLoginModal();

  const { data, error } = await db.auth.getSession();

  if (error) {
    showError(error.message);
    return;
  }

  session = data.session;

  if (session) await refreshAdminStatus();

  updateAuthUI();
  await loadAll();

  if ($("loginBtn")) $("loginBtn").onclick = openLogin;

  if ($("logoutBtn")) {
    $("logoutBtn").onclick = async () => {
      await db.auth.signOut();
      session = null;
      adminStatus = false;
      updateAuthUI();
      await loadAll();
    };
  }

  if ($("activeTeam")) {
    $("activeTeam").onchange = renderBoard;
  }

  db.auth.onAuthStateChange(async (_event, s) => {
    session = s;

    if (session) {
      await refreshAdminStatus();
    } else {
      adminStatus = false;
    }

    updateAuthUI();
    await loadAll();
  });

  db.channel("bingo-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teams" },
      loadAll
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      loadAll
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_requirements" },
      loadAll
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_progress" },
      loadAll
    )
    .subscribe();
}

init();
