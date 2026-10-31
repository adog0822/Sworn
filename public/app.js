// Sworn: a guided demo. Intro → live call (verdicts appear as they're checked) → what just happened.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ui = {
  data: null,
  version: 0,
  mode: "intro",
  kind: "interview",
  callId: null,
  cards: new Map(),
  renders: new Map(),
  claimId: null,
  audience: "auditor",
  fw: "soc2",
  live: false,
  replaying: false,
  hood: false,
};

const CUES = {
  interview: [
    "We finished the Q4 access review. Raj signed off in Linear.",
    "We removed the three people who left.",
    "MFA is enforced for everyone through Okta.",
  ],
  fix: "Explain it, or promise a fix: \"That's an old contractor account. I'll delete it today.\"",
  done: "Wrap up: \"Thanks. What does the auditor get?\"",
  auditor: [
    "How do you enforce two-step login?",
    "What happens to access when someone leaves?",
    "Do all production changes get reviewed?",
  ],
};

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, ms = 4200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- state ----------

async function refresh(force = false) {
  try {
    const { version } = await api("/api/version");
    if (!force && version === ui.version) return;
    ui.data = await api("/api/state");
    ui.version = ui.data.version;
    ui.renders.clear();
    if (ui.mode === "call") paintCall();
    if (ui.mode === "result") paintSealed();
    if (ui.hood) paintHood();
  } catch (e) {
    console.warn(e);
  }
}

(function loop() {
  refresh().finally(() => setTimeout(loop, ui.live ? 600 : 2500));
})();

const callRec = () => ui.data?.calls.find((c) => c.id === ui.callId);
const callClaims = () => {
  const call = callRec();
  if (!call) return [];
  return ui.data.claims.filter((c) => call.claimIds.includes(c.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
};

// ---------- acts ----------

function show(mode) {
  ui.mode = mode;
  for (const id of ["act-intro", "act-call", "act-result"]) $(id).hidden = id !== `act-${mode}`;
  $("steps").hidden = mode === "intro";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function step(name) {
  const order = ["talk", "check", "translate", "seal"];
  const at = order.indexOf(name);
  document.querySelectorAll("#steps li").forEach((li, i) => {
    li.classList.toggle("on", i === at);
    li.classList.toggle("done", i < at);
  });
}

function setCue(text) {
  const cue = $("cue");
  if ($("cue-text").textContent === text) return;
  $("cue-text").textContent = text;
  cue.classList.remove("swap");
  void cue.offsetWidth;
  cue.classList.add("swap");
}

function enterCall(kind) {
  ui.kind = kind;
  ui.cards.clear();
  $("verdicts").innerHTML = "";
  $("caption").hidden = true;
  $("cue").hidden = false;
  $("status").textContent = "Connecting…";
  setCue(kind === "auditor" ? CUES.auditor[0] : CUES.interview[0]);
  show("call");
  step("talk");
}

// ---------- live call view ----------

const STAMP = { "True": "good", "Holds up": "good", "Not quite": "meh", "Not true": "bad" };

function verdictCard(c) {
  const p = c.plain;
  return `<div class="top"><span class="topic">${esc(p.topic)}</span><span class="stamp ${STAMP[p.stamp] ?? "meh"}">${esc(p.stamp)}</span></div>
    <p class="said">You said: "${esc(c.statement)}"</p>
    <p class="truth reveal-late">The records say: ${esc(p.text)}</p>
    ${c.resolution ? `<p class="fix">Noted for the auditor: ${esc(c.resolution.note)}${c.resolution.due ? ` (due ${esc(c.resolution.due)})` : ""}.</p>` : ""}`;
}

function citedCard(c) {
  return `<div class="top"><span class="topic">Answered from ${esc(c.id)} · ${esc(c.plain.topic)}</span><span class="stamp ${STAMP[c.plain.stamp] ?? "meh"}">${esc(c.plain.stamp)}</span></div>
    <p class="truth">${esc(c.plain.text)}</p><p class="fix">Sworn only answers auditors from records it has checked.</p>`;
}

function upsertCard(key, html) {
  let el = ui.cards.get(key);
  if (!el) {
    el = document.createElement("div");
    el.className = "verdict";
    $("verdicts").prepend(el);
    ui.cards.set(key, el);
    el.innerHTML = html;
    el.dataset.html = html;
  } else if (el.dataset.html !== html) {
    el.innerHTML = html.replace(/ reveal-late/g, "").replace(/class="stamp/, 'style="animation:none" class="stamp');
    el.dataset.html = html;
  }
}

function paintCall() {
  const call = callRec();
  if (!call) return;
  if (ui.kind === "auditor") {
    const cited = call.turns.filter((t) => t.role === "tool").flatMap((t) => t.text.match(/SW-\d+/g) ?? []);
    [...new Set(cited)].forEach((id) => {
      const c = ui.data.claims.find((x) => x.id === id);
      if (c) upsertCard(id, citedCard(c));
    });
    setCue(CUES.auditor[Math.min(ui.cards.size, CUES.auditor.length - 1)]);
    return;
  }
  const claims = callClaims();
  claims.forEach((c) => upsertCard(c.id, verdictCard(c)));
  if (claims.length) step("check");
  const open = claims.filter((c) => c.verdict !== "verified" && c.status !== "resolved");
  if (claims.length >= 3 && open.length === 0) setCue(CUES.done);
  else if (open.length) setCue(CUES.fix);
  else setCue(CUES.interview[Math.min(claims.length, 2)]);
  if (ui.replaying) {
    const last = call.turns.filter((t) => t.role !== "tool").at(-1);
    if (last) {
      $("caption").hidden = false;
      $("caption").innerHTML = `<span class="who">${last.role === "agent" ? "Sworn" : "Priya (engineer)"}</span>${esc(last.text)}`;
      $("orb").classList.toggle("listening", last.role !== "agent");
      $("status").textContent = last.role === "agent" ? "Sworn is speaking" : "Priya is speaking";
    }
  }
}

// ---------- Bolna browser call ----------

let call = null;

async function startCall(kind, callbackId) {
  if (!window.BolnaWebCall) return toast("The voice SDK is still loading. Try again in a second.");
  enterCall(kind);
  if (callbackId) setCue("Sworn is calling about a claim that stopped being true. Explain what happened.");
  ui.live = true;
  const qs = new URLSearchParams({ kind, ...(callbackId ? { callback: callbackId } : {}) });
  call = new window.BolnaWebCall({ sessionUrl: `/api/web-call/session?${qs}` });
  let quietSince = 0;
  call.on("state-change", (s) => {
    if (s === "connecting" || s === "ringing") $("status").textContent = "Connecting…";
  });
  call.on("volume-level", (v) => {
    $("orb").style.setProperty("--v", (1 + Math.min(v, 1) * 0.35).toFixed(3));
    const now = performance.now();
    if (v > 0.04) quietSince = now;
    const speaking = now - quietSince < 700;
    $("orb").classList.toggle("listening", !speaking);
    $("status").textContent = speaking ? "Sworn is speaking" : "Your turn";
  });
  call.on("call-start", () => {
    ui.callId = call.getRunId?.() || null;
    refresh(true);
  });
  call.on("call-end", () => finishCall());
  call.on("error", (e) => {
    toast(e.code === "at_capacity" ? "All lines are busy right now. Watch a call instead." : e.code === "microphone_denied" ? "Your microphone is blocked. Allow it, or watch a call instead." : `Call error: ${e.message || e.code}`);
    ui.live = false;
    show("intro");
  });
  try {
    await call.start();
  } catch (e) {
    toast(e.message || "Could not start the call.");
    ui.live = false;
    show("intro");
  }
}

async function finishCall() {
  $("status").textContent = "Call ended";
  $("orb").style.setProperty("--v", 1);
  // The transcript and seal arrive by webhook a few seconds after hang-up.
  for (let i = 0; i < 6 && !callRec()?.packetId; i++) {
    await sleep(1500);
    await refresh(true);
  }
  ui.live = false;
  if (ui.kind === "interview" && callClaims().length) showResult();
  else {
    show("intro");
    toast(ui.kind === "auditor" ? "Auditor call ended. Every answer came from checked records." : "Call ended before any claims were made. Try again, or watch a call.");
  }
}

$("hangup").onclick = async () => {
  if (ui.replaying) {
    ui.replaying = false;
    return;
  }
  await call?.stop().catch(() => {});
};

// ---------- sample call (no mic) ----------

async function watch() {
  enterCall("interview");
  ui.replaying = true;
  ui.live = true;
  $("cue").hidden = true;
  $("status").textContent = "Sample call · captions only";
  try {
    const { callId, steps } = await api("/api/replay", { action: "start" });
    ui.callId = callId;
    for (let i = 0; i < steps && ui.replaying; i++) {
      const r = await api("/api/replay", { action: "step", callId, index: i });
      await refresh(true);
      await sleep(r.pauseMs);
      if (r.done) break;
    }
  } catch (e) {
    toast(e.message);
  }
  const finished = ui.replaying;
  ui.replaying = false;
  ui.live = false;
  if (finished) {
    await refresh(true);
    showResult();
  } else show("intro");
}

// ---------- result walkthrough ----------

async function showResult() {
  await refresh(true);
  const claims = callClaims();
  show("result");
  step("translate");
  document.querySelectorAll(".beat").forEach((b) => b.classList.remove("in"));
  $("heard").innerHTML = claims.map((c) => `<span class="chip">"${esc(c.statement)}"</span>`).join("");

  const caught = claims.filter((c) => c.verdict !== "verified");
  const subjects = {};
  claims.forEach((c) => new Set(c.checks.flatMap((k) => k.exceptions.filter((f) => f.severity !== "low").map((f) => f.subject))).forEach((s) => (subjects[s] = (subjects[s] ?? 0) + 1)));
  const root = Object.entries(subjects).sort((a, b) => b[1] - a[1])[0];
  $("checked-h").textContent = caught.length
    ? `It caught ${caught.length} of ${claims.length} before an auditor could.`
    : `All ${claims.length} held up against the real systems.`;
  $("checked-sub").textContent = root && root[1] > 1
    ? `One forgotten account, ${root[0]}, broke ${root[1]} of your statements at once. ${claims.map((c) => `${c.plain.topic}: ${c.plain.stamp}`).join(" · ")}.`
    : claims.map((c) => `${c.plain.topic}: ${c.plain.stamp}`).join(" · ");

  ui.claimId = (caught[0] ?? claims[0])?.id;
  $("claimtabs").innerHTML = claims.map((c) => `<button data-claim="${c.id}">${esc(c.plain.topic)}</button>`).join("");
  paintRendered();
  paintSealed();
  $("drift").innerHTML = "";
  $("break-row").innerHTML = `<button class="btn primary" id="fix">First, Priya makes her fix</button>`;

  const beats = [...document.querySelectorAll(".beat")];
  for (let i = 0; i < beats.length; i++) {
    await sleep(i === 0 ? 150 : 650);
    beats[i].classList.add("in");
  }
}

async function paintRendered() {
  const id = ui.claimId;
  document.querySelectorAll("#claimtabs button").forEach((b) => b.classList.toggle("on", b.dataset.claim === id));
  document.querySelectorAll("#aud button").forEach((b) => b.classList.toggle("on", b.dataset.a === ui.audience));
  $("fwpick").hidden = ui.audience !== "auditor";
  if (!id) return;
  const box = $("rendered");
  box.classList.add("fade");
  let r = ui.renders.get(id);
  if (!r) {
    r = await api(`/api/claims/${id}/renders`).catch(() => null);
    if (!r) return;
    ui.renders.set(id, r);
  }
  box.textContent = ui.audience === "auditor" ? r.auditor[ui.fw] : r[ui.audience];
  box.classList.remove("fade");
}

function paintSealed() {
  if (ui.mode !== "result") return;
  const call = callRec();
  const p = call?.packetId && ui.data.packets.find((x) => x.packetId === call.packetId);
  if (!p) {
    $("sealed").textContent = "Sealing the call record…";
    return;
  }
  step("seal");
  $("sealed").innerHTML = `Packet ${esc(p.packetId)}, fingerprint <span class="hash">${esc(p.sha256.slice(0, 24))}…</span>. Change one word and the fingerprint breaks. <a href="/verify.html?packet=${esc(p.packetId)}" target="_blank" rel="noopener">Verify it yourself</a>`;
}

const STAMP_OF = { verified: ["True", "good"], partial: ["Not quite", "meh"], contradicted: ["Not true", "bad"], unverifiable: ["Unverifiable", "meh"] };

async function scenario(name) {
  const r = await api("/api/scenario", { name });
  await refresh(true);
  return r;
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "fix") {
    t.disabled = true;
    const r = await scenario("contractor_removed");
    const lines = r.changed.map((c) => {
      const claim = ui.data.claims.find((x) => x.id === c.id);
      const [label, cls] = STAMP_OF[c.to];
      return `<div class="verdict"><div class="top"><span class="topic">${esc(claim?.plain.topic ?? c.id)} · re-checked</span><span class="stamp ${cls}">${label}</span></div><p class="truth">${esc(claim?.plain.text ?? "")}</p></div>`;
    }).join("");
    $("drift").innerHTML = `<p class="sub">Priya deleted jsmith-contractor. Sworn re-checked everything she said, on its own:</p>${lines || '<p class="sub">Nothing changed.</p>'}`;
    $("break-row").innerHTML = `<button class="btn primary" id="break">Now someone adds an admin without two-step login</button>`;
  }
  if (t.id === "break") {
    t.disabled = true;
    await scenario("new_admin_without_mfa");
    const cb = ui.data.callbacks.at(-1);
    const claim = cb && ui.data.claims.find((c) => c.id === cb.claimId);
    $("drift").innerHTML = cb
      ? `<div class="verdict"><div class="top"><span class="topic">${esc(claim?.plain.topic ?? "")} · drifted</span><span class="stamp drift">No longer true</span></div>
          <p class="truth">Something Priya said is no longer true: ${esc(claim?.plain.text ?? "")} Nobody had to notice. Sworn is calling her back.</p>
          <div class="row" style="margin-top:10px"><button class="btn primary" data-callback="${esc(cb.id)}">Take Sworn's callback as Priya</button></div></div>`
      : `<p class="sub">No claim depended on that, so nothing drifted.</p>`;
    $("break-row").innerHTML = "";
  }
  if (t.dataset.callback) startCall("interview", t.dataset.callback);
  if (t.dataset.claim) {
    ui.claimId = t.dataset.claim;
    paintRendered();
  }
  if (t.dataset.a) {
    ui.audience = t.dataset.a;
    paintRendered();
  }
  if (t.dataset.scenario) {
    const r = await scenario(t.dataset.scenario);
    toast(`${r.reason}. ${r.changed.length} claim${r.changed.length === 1 ? "" : "s"} re-checked.`);
  }
});

$("fw").onchange = (e) => {
  ui.fw = e.target.value;
  paintRendered();
};

// ---------- entry points ----------

$("start").onclick = () => startCall("interview");
$("watch").onclick = () => watch();
$("as-auditor").onclick = () => startCall("auditor");
$("result-auditor").onclick = () => startCall("auditor");
$("again").onclick = async () => {
  await api("/api/reset", {});
  await refresh(true);
  show("intro");
};

// ---------- under the hood ----------

function paintHood() {
  const d = ui.data;
  if (!d) return;
  $("ledger").innerHTML = d.claims.map((c) => `<div class="item"><span class="tag ${c.status === "drifted" ? "drifted" : c.verdict}">${esc(c.status === "drifted" ? "drifted" : c.verdict)}</span> <b>${esc(c.id)}</b> ${esc(c.normalized)}<div class="meta">${esc(c.speaker.name)} · "${esc(c.statement)}"</div></div>`).join("");
  const s = d.systems;
  $("systems").innerHTML = `<div><b>${s.awsIamUsers}</b>AWS IAM users, ${s.awsIamWithoutMfa.length} without MFA</div><div><b>${s.oktaActive}</b>active Okta users</div><div><b>${s.prodRepos}</b>production repos</div><div><b>${s.dataStores}</b>encrypted data stores</div>`;
  $("packets").innerHTML = d.packets.map((p) => `<div class="ledger item"><b>${esc(p.packetId)}</b> · ${p.claims} claims · <a href="/verify.html?packet=${esc(p.packetId)}">verify</a><div class="hash">${esc(p.sha256)}</div></div>`).join("") || `<p class="sub">None yet.</p>`;
  $("log").innerHTML = d.log.slice(0, 12).map((e) => `<div><span class="hash">${esc(e.hash.slice(0, 8))}</span><span>${esc(e.summary)}</span></div>`).join("");
}

function openHood(open) {
  ui.hood = open;
  $("hood").hidden = !open;
  $("open-hood").setAttribute("aria-expanded", String(open));
  if (open) {
    paintHood();
    $("close-hood").focus();
  }
}
$("open-hood").onclick = () => openHood(true);
$("close-hood").onclick = () => openHood(false);
document.addEventListener("keydown", (e) => e.key === "Escape" && ui.hood && openHood(false));

$("ask-go").onclick = async () => {
  const question = $("ask").value.trim();
  if (!question) return;
  const r = await api("/api/ask", { question, framework: "soc2" }).catch((e) => ({ answer: e.message }));
  $("answer").hidden = false;
  $("answer").textContent = r.answer;
};
$("ask").onkeydown = (e) => e.key === "Enter" && $("ask-go").click();

$("phone-go").onclick = async () => {
  try {
    const r = await api("/api/calls", { kind: "interview", phone: $("phone").value.trim(), passcode: $("passcode").value });
    ui.callId = r.executionId;
    openHood(false);
    enterCall("interview");
    ui.live = true;
    $("status").textContent = "Calling your phone…";
  } catch (e) {
    toast(e.message);
  }
};
$("mcp-url").textContent = `POST ${location.origin}/mcp`;
