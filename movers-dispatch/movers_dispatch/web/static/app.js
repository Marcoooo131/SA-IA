"use strict";
// Dashboard: polls /api/state, renders counters and rows. Every rule is enforced server side.

const STATUS_LABELS = {
  en_attente: "En attente", propose: "Proposé (simulation)", a_valider: "À valider", validation_humaine: "Validation humaine",
  affecte: "Affecté", ignore: "Ignoré", refuse: "Refusé", erreur: "Erreur",
};
const $ = (id) => document.getElementById(id);
let last = null;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-Requested-With": "movers-dispatch" },
  };
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `Erreur ${r.status}`);
  return data;
}

function mode() { return document.querySelector("input[name=mode]:checked").value; }

function renderBanner(s) {
  const b = $("banner");
  const problems = [...s.config.problems, ...s.state.problems];
  if (problems.length) {
    b.className = "banner warn";
    b.textContent = "Écritures bloquées tant que ces points ne sont pas réglés : " + problems.join(" · ");
  } else if (mode() === "simulation") {
    b.className = "banner sim";
    b.textContent = "Mode Simulation : lecture seule, aucune modification n'est faite dans Dynamics 365.";
  } else {
    b.className = "banner"; b.textContent = "";
  }
  if (s.config.connection === "fake") {
    b.textContent = "Données FICTIVES (connexion de démonstration). " + b.textContent;
    if (!b.className.includes("warn")) b.className = "banner sim";
  }
}

function renderRows(items) {
  const f = $("filter").value;
  const rows = items.filter((i) => !f || i.status === f);
  if (!rows.length) {
    $("rows").innerHTML = `<tr><td colspan="9" class="muted">Aucun élément${f ? " pour ce statut" : ""}.</td></tr>`;
    return;
  }
  $("rows").innerHTML = rows.map((i) => `
    <tr>
      <td class="id" data-label="Élément" title="${esc(i.queueitem_id)}">${esc(i.queueitem_id.slice(0, 8))}…</td>
      <td data-label="Sujet">${esc(i.subject)}</td>
      <td data-label="Compte">${esc(i.account_name)}</td>
      <td data-label="Case">${esc(i.case_number)}</td>
      <td data-label="Owner">${esc(i.owner_name)}</td>
      <td data-label="Worked By"><b>${esc(i.worked_by_name)}</b></td>
      <td data-label="Statut"><span class="pill ${esc(i.status)}">${esc(STATUS_LABELS[i.status] || i.status)}</span></td>
      <td data-label="Motif">${esc(i.reason)}</td>
      <td class="actions">${i.status === "a_valider" ? `
        <button class="small primary" data-approve="${esc(i.queueitem_id)}">Valider ${esc(i.worked_by_name)}</button>
        <button class="small" data-reject="${esc(i.queueitem_id)}">Refuser</button>` : ""}
        <button class="small" data-history="${esc(i.queueitem_id)}">Historique</button></td>
    </tr>`).join("");
}

function renderEvents(events) {
  $("events").innerHTML = events.map((e) => `<li><code>${esc(e.ts.replace("T", " ").slice(0, 19))}</code>
    ${e.queueitem_id ? `<code>${esc(e.queueitem_id.slice(0, 8))}</code>` : ""} <b>${esc(e.action)}</b>
    ${esc(e.detail === "{}" ? "" : e.detail)} <span class="muted">(${esc(e.actor)})</span></li>`).join("");
}

async function refresh() {
  try {
    const s = await api("/api/state");
    last = s;
    for (const [k, v] of Object.entries(s.counters)) { const el = $("c-" + k); if (el) el.textContent = v; }
    const auto = document.querySelector("input[value=automatique]");
    auto.disabled = !s.config.automatic_allowed;
    $("auto-label").classList.toggle("disabled", auto.disabled);
    $("auto-label").title = auto.disabled ? "Non autorisé par la configuration (agent.automatic_allowed = false)" : "";
    $("run").disabled = s.state.running;
    $("stop").disabled = !s.state.running;
    $("runstate").textContent = s.state.running
      ? `Traitement en cours (${s.state.mode})${s.state.current ? " — " + s.state.current.slice(0, 8) + "…" : ""}`
      : s.state.message;
    renderBanner(s);
    renderRows(s.items);
    if (!$("events").dataset.item) renderEvents(await api("/api/events"));
  } catch (e) {
    $("banner").className = "banner err";
    $("banner").textContent = e.message;
  }
}

$("modes").addEventListener("change", () => {
  $("auto-confirm").hidden = mode() !== "automatique";
  if (last) renderBanner(last);
});
$("filter").innerHTML += Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("filter").addEventListener("change", () => last && renderRows(last.items));

$("run").addEventListener("click", async () => {
  try {
    await api("/api/run", { mode: mode(), confirmation: $("confirmation").value.trim() });
    $("confirmation").value = "";
  } catch (e) { alert(e.message); }
  refresh();
});
$("stop").addEventListener("click", async () => { await api("/api/stop", {}); refresh(); });

$("rows").addEventListener("click", async (ev) => {
  const t = ev.target.closest("button");
  if (!t) return;
  try {
    if (t.dataset.approve) {
      if (!confirm(`Écrire Worked By = ${t.textContent.replace("Valider ", "")} dans Dynamics 365 ?`)) return;
      t.disabled = true;
      await api(`/api/items/${t.dataset.approve}/approve`, {});
    } else if (t.dataset.reject) {
      const note = prompt("Motif du refus (facultatif, sans donnée client) :") ?? null;
      if (note === null) return;
      await api(`/api/items/${t.dataset.reject}/reject`, { note });
    } else if (t.dataset.history) {
      $("events").dataset.item = t.dataset.history;
      renderEvents(await api(`/api/events?item=${encodeURIComponent(t.dataset.history)}`));
      $("events").insertAdjacentHTML("afterbegin", `<li><button class="small" id="all-events">Tout l'historique</button></li>`);
      $("all-events").addEventListener("click", () => { delete $("events").dataset.item; refresh(); });
      $("events").scrollIntoView({ behavior: "smooth" });
      return;
    }
  } catch (e) { alert(e.message); }
  refresh();
});

refresh();
setInterval(refresh, 2000);
