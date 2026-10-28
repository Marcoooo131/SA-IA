"use strict";
// Dashboard: polls /api/state, renders counters and rows. Every rule is enforced server side.

const STATUS_LABELS = {
  en_attente: "En attente", propose: "Proposé (simulation)", a_valider: "À valider", validation_humaine: "Validation humaine",
  affecte: "Affecté", refuse: "Refusé", erreur: "Erreur",
};
const $ = (id) => document.getElementById(id);
let last = null;
let collaborators = [];

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
    $("rows").innerHTML = `<tr><td colspan="10" class="muted">Aucun élément${f ? " pour ce statut" : ""}.</td></tr>`;
    return;
  }
  $("rows").innerHTML = rows.map((i) => `
    <tr>
      <td class="id" data-label="Élément" title="${esc(i.queueitem_id)}">${esc(i.queueitem_id.slice(0, 8))}…</td>
      <td data-label="Sujet">${esc(i.subject)}</td>
      <td data-label="Catégorie">${esc(categoryLabel(i.category))}${i.method === "rotation" ? ` <span class="muted">(rotation)</span>` : ""}</td>
      <td data-label="Compte">${i.client_name ? `<span class="pill a_valider">à rattacher</span> ${esc(i.client_name)}
        <div class="muted">${esc(i.client_via)}</div>` : esc(i.account_name)}${!i.client_name && i.client_via ? `<div class="muted">${esc(i.client_via)}</div>` : ""}</td>
      <td data-label="Case">${esc(i.case_number)}</td>
      <td data-label="Owner">${esc(i.owner_name)}</td>
      <td data-label="Worked By"><b>${esc(i.worked_by_name)}</b></td>
      <td data-label="Statut"><span class="pill ${esc(i.status)}">${esc(STATUS_LABELS[i.status] || i.status)}</span></td>
      <td data-label="Motif">${esc(i.reason)}</td>
      <td class="actions">${i.status === "a_valider" ? `
        <button class="small primary" data-approve="${esc(i.queueitem_id)}">Valider ${i.client_name ? "client + " : ""}${esc(i.worked_by_name)}</button>
        ${pick(i.queueitem_id, "Corriger : le bon collègue est…")}
        <button class="small" data-correct="${esc(i.queueitem_id)}">Corriger</button>
        <button class="small" data-reject="${esc(i.queueitem_id)}">Refuser</button>` : ""}${i.status === "validation_humaine" ? `
        ${pick(i.queueitem_id, "Attribuer à…", true)}
        <button class="small primary" data-assign="${esc(i.queueitem_id)}">Attribuer</button>` : ""}${i.client_to_link && ["a_valider", "validation_humaine"].includes(i.status) ? `
        <span class="link-client"><input class="small" data-acct="${esc(i.queueitem_id)}" inputmode="numeric" size="11"
          placeholder="N° de compte" aria-label="Numéro de compte du client">
        <button class="small" data-link="${esc(i.queueitem_id)}">${i.client_name ? "Corriger le client" : "Rattacher le client"}</button></span>` : ""}
        ${i.attachments ? `<button class="small" data-attach="${esc(i.queueitem_id)}">Voir la pièce jointe</button>` : ""}
        <button class="small" data-history="${esc(i.queueitem_id)}">Historique</button></td>
    </tr>`).join("");
}

function categoryLabel(key) {
  const c = last && last.rotation.categories.find((x) => x.key === key);
  return c ? c.label : "";
}

function pick(id, label, withRotation = false) {
  const turns = withRotation && last && last.rotation.active ? last.rotation.categories.filter((c) => c.prochain)
    .map((c) => `<option value="rotation:${esc(c.key)}">Suivant en ${esc(c.label)} (${esc(c.prochain)})</option>`).join("") : "";
  return `<select class="small" data-pick="${esc(id)}" aria-label="${esc(label)}">
    <option value="">${esc(label)}</option>
    ${collaborators.map((c) => `<option value="${esc(c.key)}">${esc(c.first_name)}</option>`).join("")}
    ${turns}
  </select>`;
}

function renderSupervision(s) {
  for (const k of ["acceptees", "corrigees", "refusees", "manuelles", "serie"]) $("s-" + k).textContent = s[k];
  $("s-taux").textContent = s.taux_accord === null ? "–" : s.taux_accord + " %";
  $("s-ready").className = "ready " + (s.pret ? "ok" : "wait");
  $("s-ready").textContent = s.pret
    ? `${s.serie} propositions validées d'affilée sans correction : le mode Automatique peut être envisagé (avec l'accord de votre responsable).`
    : `Objectif avant le mode Automatique : ${s.objectif} propositions validées d'affilée sans correction. Série actuelle : ${s.serie}.`;
  $("corrections").innerHTML = s.corrections.length ? s.corrections.slice(0, 30).map((c) => `
    <tr><td data-label="Date"><code>${esc(c.ts.replace("T", " ").slice(0, 16))}</code></td>
      <td data-label="Sujet">${esc(c.subject)}</td>
      <td data-label="Proposé">${esc(c.propose)} <span class="muted">(${esc(c.case_propose)})</span></td>
      <td data-label="Bonne réponse"><b>${esc(c.retenu)}</b></td>
      <td data-label="Cases vus" class="muted">${esc((c.cases_vus || []).join(" · "))}</td>
      <td data-label="Pourquoi">${esc(c.note)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">Aucune correction pour l'instant.</td></tr>`;
}

function renderRotation(r) {
  $("rotation-next").innerHTML = r.active ? r.categories.map((c) => `<div><span class="muted">${esc(c.label)} — prochain :</span>
    <b>${esc(c.prochain || "personne")}</b> <span class="muted">(ordre : ${esc(c.ordre.join(" → "))})</span></div>`).join("")
    : `<div class="muted">Rotation désactivée dans dispatch.toml.</div>`;
  const share = (m) => Object.entries(m).map(([n, k]) => `${esc(n)} ${k}`).join(" · ") || "–";
  $("rotation-counts").innerHTML = r.categories.map((c) => `<div class="rot-count">
    <b>${c.aujourdhui}</b> <span>« ${esc(c.label)} » aujourd'hui via la rotation</span>
    <div class="muted">${share(c.par_personne_aujourdhui)} — depuis le début : ${c.total} (${share(c.par_personne)})</div></div>`).join("");
  $("absents").innerHTML = r.collaborateurs.map((c) => `<label><input type="checkbox" data-absent="${esc(c.key)}"
    ${c.absent ? "checked" : ""}> ${esc(c.first_name)} absent(e)</label>`).join("");
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
    collaborators = s.config.collaborators;
    // keep a drop-down choice while the list refreshes every 2 seconds
    const picked = Object.fromEntries([...document.querySelectorAll("select[data-pick]")].map((el) => [el.dataset.pick, el.value]));
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
    // do not redraw the list while someone is typing a number or choosing in it
    if (!$("rows").contains(document.activeElement)) renderRows(s.items);
    renderRotation(s.rotation);
    if (s.state.warnings && s.state.warnings.length) {
      $("banner").textContent += " " + s.state.warnings.join(" · ");
    }
    for (const [id, v] of Object.entries(picked)) {
      const el = document.querySelector(`select[data-pick="${CSS.escape(id)}"]`);
      if (el) el.value = v;
    }
    renderSupervision(await api("/api/supervision"));
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
    } else if (t.dataset.assign) {
      const sel = document.querySelector(`select[data-pick="${CSS.escape(t.dataset.assign)}"]`);
      if (!sel || !sel.value) { alert("Choisir d'abord un collaborateur dans la liste."); return; }
      const name = sel.options[sel.selectedIndex].text;
      if (!confirm(`Écrire Worked By = ${name} dans le CRM pour cet élément ?`)) return;
      t.disabled = true;
      await api(`/api/items/${t.dataset.assign}/assign`, { collaborator: sel.value });
    } else if (t.dataset.correct) {
      const sel = document.querySelector(`select[data-pick="${CSS.escape(t.dataset.correct)}"]`);
      if (!sel || !sel.value) { alert("Choisir d'abord le bon collègue dans la liste."); return; }
      const name = sel.options[sel.selectedIndex].text;
      const note = prompt(`Écrire Worked By = ${name} dans le CRM.\n\nPourquoi l'agent s'est-il trompé ? (facultatif, ex. « le Case Mover résolu est le bon », sans donnée client)`);
      if (note === null) return;
      t.disabled = true;
      await api(`/api/items/${t.dataset.correct}/correct`, { collaborator: sel.value, note });
    } else if (t.dataset.link) {
      const input = document.querySelector(`input[data-acct="${CSS.escape(t.dataset.link)}"]`);
      if (!input || !input.value.trim()) { alert("Saisir le numéro de compte (Account Number) du client."); return; }
      // show which account the number designates first: a misread digit can be another real client
      const acc = await api(`/api/accounts/check?number=${encodeURIComponent(input.value.trim())}`);
      const note = prompt(`Le n° ${acc.number} correspond au compte :\n\n    ${acc.name}\n\nEst-ce le bon client ? `
        + "OK = rattacher (écrit dans le Regarding du CRM), Annuler = ne rien faire.\n\n"
        + "Comment l'avez-vous trouvé ? (facultatif, ex. « lettre scannée », sans donnée client)");
      if (note === null) return;
      t.disabled = true;
      await api(`/api/items/${t.dataset.link}/link`, { account_number: input.value.trim(), note });
      input.blur();
    } else if (t.dataset.attach) {
      const files = await api(`/api/items/${t.dataset.attach}/attachments`);
      if (!files.length) { alert("Aucune pièce jointe."); return; }
      for (const f of files) window.open(`/api/items/${t.dataset.attach}/attachments/${f.id}`, "_blank", "noopener");
      return;
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

document.addEventListener("change", async (ev) => {
  const box = ev.target.closest("input[data-absent]");
  if (!box) return;
  try {
    renderRotation(await api("/api/rotation/absent", { key: box.dataset.absent, absent: box.checked }));
  } catch (e) { alert(e.message); }
});
