"use strict";
// Interface of the Phone Call desktop app. No external resource, no inline script (CSP).

const TOKEN = document.querySelector('meta[name="pcd-token"]').content;
const $ = (id) => document.getElementById(id);
const STATE_LABELS = { ready: "Prêt", capturing: "Capture en cours", finalizing: "Transcription en cours",
  generating: "Génération de la note", done: "Terminé", error: "Erreur" };

let current = { state: "ready" };
let editing = false;
let timerHandle = null;
const segments = new Map(); // utterance_id -> segment

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-PCD-Token": TOKEN, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw (data.error || { message: `Erreur ${res.status}` });
  return data;
}

function notice(level, message) {
  const li = document.createElement("li");
  li.className = level;
  li.textContent = message;
  $("notices").prepend(li);
  while ($("notices").children.length > 8) $("notices").lastChild.remove();
}

function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ devices

async function loadDevices(refresh = false) {
  try {
    const data = await api(`/api/devices?refresh=${refresh ? 1 : 0}`);
    if (data.backend === "test-files") {
      $("test-banner").hidden = false;
      $("test-banner").textContent = "MODE TEST — sources audio simulées à partir de fichiers synthétiques ou anonymisés.";
    }
    for (const [channel, select] of [["system", $("system-device")], ["mic", $("mic-device")]]) {
      const previous = select.value;
      select.innerHTML = "";
      const devices = data.devices.filter((d) => d.channel === channel);
      const def = document.createElement("option");
      def.value = "";
      def.textContent = "Périphérique par défaut de Windows";
      select.append(def);
      for (const d of devices) {
        const o = document.createElement("option");
        o.value = d.id;
        o.textContent = d.name + (d.is_default ? " (par défaut)" : "") + (d.note ? ` — ${d.note}` : "");
        select.append(o);
      }
      if ([...select.options].some((o) => o.value === previous)) select.value = previous;
      if (!devices.length) {
        def.textContent = "Aucun périphérique détecté";
        $(channel === "system" ? "use-system" : "use-mic").checked = false;
      }
    }
    if (!data.devices.length) notice("error", data.error?.message || "Aucune source audio détectée. Branchez un casque ou vérifiez les paramètres son de Windows.");
  } catch (e) {
    notice("error", e.message);
  }
}

// ------------------------------------------------------------------ rendering

function renderState(s) {
  current = { ...current, ...s };
  const st = current.state;
  const badge = $("state-badge");
  badge.textContent = STATE_LABELS[st] || st;
  badge.className = `badge s-${st}`;
  const capturing = st === "capturing";
  $("capture-banner").hidden = !capturing;
  document.title = capturing ? "● CAPTURE – Phone Call" : "Phone Call – prise de notes";
  const busy = ["capturing", "finalizing", "generating"].includes(st);
  const loading = current.recognizer_status === "loading";
  $("btn-start").disabled = busy || loading || (current.consent_required && !$("consent").checked);
  $("engine-status").hidden = !loading;
  $("btn-stop").disabled = !capturing;
  for (const id of ["use-system", "use-mic", "system-device", "mic-device", "btn-refresh", "consent"]) $(id).disabled = busy;
  $("btn-new").disabled = busy;
  const hasNote = st === "done" && $("note").value.trim().length > 0;
  $("btn-copy").disabled = !hasNote;
  $("btn-edit").disabled = st !== "done";
  $("btn-retry").hidden = !(st === "error" && current.error && current.error.retryable);
  $("timer").hidden = !capturing;
  clearInterval(timerHandle);
  if (capturing && current.started_at) {
    timerHandle = setInterval(() => { $("timer").textContent = fmt(Date.now() / 1000 - current.started_at); }, 500);
  }
  const status = { finalizing: "Transcription des derniers mots…", generating: "Génération de la note en cours…",
    done: "Note générée : relisez-la avant de la copier.", ready: "La note sera générée à la fin de la conversation." };
  $("note-status").textContent = st === "error" && current.error ? current.error.message : (status[st] || "");
  if (st === "error" && current.error) {
    notice("error", current.error.message);
    if (String(current.error.code).startsWith("ai_key")) { loadAIKey(); openAIKey(); }
  }
}

function renderSegment(seg) {
  segments.set(seg.utterance_id, seg);
  drawTranscript();
}

function drawTranscript() {
  const box = $("transcript");
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = "";
  const list = [...segments.values()].filter((s) => s.text).sort((a, b) => a.t_start - b.t_start);
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "La transcription s'affichera ici pendant l'appel.";
    box.append(p);
    return;
  }
  for (const s of list) {
    const div = document.createElement("div");
    div.className = `seg ${s.speaker}` + (s.final ? "" : " partial") + (s.uncertain && s.final ? " uncertain" : "") + (s.echo ? " echo" : "");
    if (s.echo) div.title = "Écho de la voix de l'interlocuteur capté par le micro : ignoré.";
    const ts = document.createElement("span"); ts.className = "ts"; ts.textContent = fmt(s.t_start);
    const who = document.createElement("span"); who.className = "who"; who.textContent = s.speaker_label;
    const txt = document.createElement("span"); txt.className = "txt"; txt.textContent = s.text + (s.final ? "" : " …");
    div.append(ts, who, txt);
    box.append(div);
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function renderNote(text, meta) {
  if (!editing) $("note").value = text || "";
  const flags = $("flags");
  flags.innerHTML = "";
  if (!meta) return;
  for (const f of meta.flags || []) {
    const li = document.createElement("li");
    li.className = f.severity;
    li.textContent = (f.severity === "blocking" ? "À corriger : " : "À vérifier : ") + f.message;
    flags.append(li);
  }
  for (const p of meta.points_to_verify || []) {
    const li = document.createElement("li");
    li.textContent = "Point à confirmer : " + p;
    flags.append(li);
  }
}

function renderLevels(data) {
  for (const ch of ["system", "mic"]) {
    const info = data.channels[ch];
    const fill = $(`meter-${ch}`), label = $(`meter-${ch}-label`);
    if (!info) { fill.style.width = "0"; label.textContent = "non capté"; label.className = "meter-label"; continue; }
    const pct = Math.max(0, Math.min(100, (info.dbfs + 60) * (100 / 60)));
    fill.style.width = `${pct}%`;
    label.textContent = !info.connected ? "périphérique déconnecté — reconnexion…" : info.signal ? `son détecté — ${info.device}` : `aucun son — ${info.device}`;
    label.className = "meter-label" + (info.signal ? "" : " nosignal");
  }
  const lag = data.lag_s || 0;
  $("lag").hidden = lag < 8;
  $("lag").textContent = `La transcription a ${Math.round(lag)} s de retard (poste chargé) : aucun texte n'est perdu.`;
}

function applySnapshot(s) {
  renderState(s);
  $("consent-row").hidden = !s.consent_required;
  $("consent-label").textContent = s.consent_label || "";
  $("btn-history").hidden = !s.history_enabled;
  segments.clear();
  for (const seg of s.transcript || []) segments.set(seg.utterance_id, seg);
  drawTranscript();
  renderNote(s.note, s.note_meta);
  renderState(s);
}

// ------------------------------------------------------------------ live connection

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws?t=${encodeURIComponent(TOKEN)}`);
  let ping;
  ws.onopen = () => { ping = setInterval(() => ws.send("ping"), 5000); };
  ws.onmessage = (msg) => {
    const { type, data } = JSON.parse(msg.data);
    if (type === "snapshot") applySnapshot(data);
    else if (type === "state") renderState(data);
    else if (type === "segment") renderSegment(data);
    else if (type === "transcript") { segments.clear(); data.segments.forEach((s) => segments.set(s.utterance_id, s)); drawTranscript(); }
    else if (type === "note") { editing = false; $("note").readOnly = true; $("btn-edit").textContent = "Modifier la note"; renderNote(data.text, data.meta); renderState({}); }
    else if (type === "levels") renderLevels(data);
    else if (type === "notice") notice(data.level, data.message);
  };
  ws.onclose = () => { clearInterval(ping); setTimeout(connect, 1000); };
}

// ------------------------------------------------------------------ actions

async function start() {
  segments.clear(); drawTranscript(); $("note").value = ""; $("flags").innerHTML = ""; $("notices").innerHTML = "";
  try {
    await api("/api/start", { method: "POST", body: JSON.stringify({
      use_system: $("use-system").checked, use_mic: $("use-mic").checked,
      system_device: $("system-device").value || null, mic_device: $("mic-device").value || null,
      consent: $("consent").checked,
    }) });
  } catch (e) { notice("error", e.message); }
}

async function stop() {
  $("btn-stop").disabled = true;
  try { await api("/api/stop", { method: "POST" }); } catch (e) { notice("error", e.message); }
}

async function copyNote() {
  const text = $("note").value;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    $("note").select();
    document.execCommand("copy");
  }
  $("btn-copy").textContent = "Copié ✓";
  setTimeout(() => { $("btn-copy").textContent = "Copier la note"; }, 1500);
  api("/api/copied", { method: "POST" }).catch(() => {});
}

async function toggleEdit() {
  if (!editing) {
    editing = true;
    $("note").readOnly = false;
    $("note").focus();
    $("btn-edit").textContent = "Enregistrer la modification";
    return;
  }
  try {
    await api("/api/note", { method: "POST", body: JSON.stringify({ text: $("note").value }) });
    editing = false;
    $("note").readOnly = true;
    $("btn-edit").textContent = "Modifier la note";
  } catch (e) { notice("error", e.message); }
}

async function newConversation() {
  if (current.state === "done" && $("note").value && !confirm("Effacer la transcription et la note affichées ?")) return;
  try {
    applySnapshot(await api("/api/new", { method: "POST" }));
    $("notices").innerHTML = "";
    editing = false; $("note").readOnly = true; $("btn-edit").textContent = "Modifier la note";
  } catch (e) { notice("error", e.message); }
}

async function openHistory() {
  const data = await api("/api/history");
  const list = $("history-list");
  list.innerHTML = "";
  $("history-note").hidden = true;
  for (const item of data.items) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${new Date(item.created_at * 1000).toLocaleString("fr-FR")} · ${fmt(item.duration_s || 0)} · ${item.preview}`;
    const open = document.createElement("button"); open.className = "small"; open.textContent = "Voir";
    open.onclick = async () => { const d = await api(`/api/history/${item.id}`); $("history-note").hidden = false; $("history-note").value = d.note + (d.transcript ? `\n\n--- Transcription ---\n${d.transcript}` : ""); };
    const del = document.createElement("button"); del.className = "small danger"; del.textContent = "Supprimer";
    del.onclick = async () => { await api(`/api/history/${item.id}`, { method: "DELETE" }); openHistory(); };
    li.append(label, open, del);
    list.append(li);
  }
  if (!data.items.length) list.innerHTML = "<li>Aucune session enregistrée.</li>";
  if (!$("history-dialog").open) $("history-dialog").showModal();
}

// ------------------------------------------------------------------ AI key (write-only)

async function loadAIKey() {
  try {
    const s = await api("/api/ai-key");
    const direct = s.mode === "anthropic";
    $("btn-ai-key").hidden = !direct;
    $("ai-key-banner").hidden = !(direct && !s.configured);
    $("ai-key-status").textContent = s.configured
      ? `Une clé est enregistrée sur ce PC (modèle : ${s.model}). Saisissez-en une nouvelle pour la remplacer.`
      : "Aucune clé enregistrée sur ce PC.";
    $("ai-key-delete").disabled = !s.configured;
  } catch (e) { /* the button stays hidden */ }
}

function openAIKey() {
  $("ai-key-error").hidden = true;
  $("ai-key-input").value = "";
  if (!$("ai-key-dialog").open) $("ai-key-dialog").showModal();
  $("ai-key-input").focus();
}

async function saveAIKey() {
  const key = $("ai-key-input").value.trim();
  if (!key) return;
  const btn = $("ai-key-save");
  btn.disabled = true; btn.textContent = "Vérification…";
  try {
    await api("/api/ai-key", { method: "PUT", body: JSON.stringify({ key }) });
    $("ai-key-input").value = "";
    $("ai-key-dialog").close();
    notice("info", "Clé API vérifiée et enregistrée dans le coffre Windows.");
    if (current.state === "error" && current.error && current.error.retryable) notice("info", "Cliquez sur « Relancer la génération » pour rédiger la note.");
  } catch (e) {
    $("ai-key-error").hidden = false;
    $("ai-key-error").textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Vérifier et enregistrer";
    loadAIKey();
  }
}

async function deleteAIKey() {
  if (!confirm("Supprimer la clé API de ce PC ?")) return;
  try { await api("/api/ai-key", { method: "DELETE" }); notice("info", "Clé API supprimée de ce PC."); }
  catch (e) { notice("error", e.message); }
  loadAIKey();
}

document.addEventListener("DOMContentLoaded", () => {
  $("btn-start").onclick = start;
  $("btn-stop").onclick = stop;
  $("btn-copy").onclick = copyNote;
  $("btn-edit").onclick = toggleEdit;
  $("btn-retry").onclick = () => api("/api/regenerate", { method: "POST" }).catch((e) => notice("error", e.message));
  $("btn-new").onclick = newConversation;
  $("btn-refresh").onclick = () => loadDevices(true);
  $("consent").onchange = () => renderState({});
  $("btn-history").onclick = openHistory;
  $("history-close").onclick = () => $("history-dialog").close();
  $("history-delete-all").onclick = async () => { if (confirm("Supprimer tout l'historique ?")) { await api("/api/history/all", { method: "DELETE" }); openHistory(); } };
  // Escape key = immediate stop of the capture
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && current.state === "capturing") stop(); });
  $("btn-ai-key").onclick = openAIKey;
  $("ai-key-banner-btn").onclick = openAIKey;
  $("ai-key-close").onclick = () => $("ai-key-dialog").close();
  $("ai-key-save").onclick = saveAIKey;
  $("ai-key-input").onkeydown = (e) => { if (e.key === "Enter") saveAIKey(); };
  $("ai-key-delete").onclick = deleteAIKey;
  loadDevices();
  loadAIKey();
  connect();
});
