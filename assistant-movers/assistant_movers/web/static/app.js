"use strict";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const mem = {};            // valeurs saisies, gardées entre deux affichages (mémoire de la page uniquement)
let S = null, choix = "", noCap = "";

async function api(path, body, libelle) {
  const busy = $("#busy");
  if (body !== undefined) { $("#busy-text").textContent = libelle || "En cours…"; busy.hidden = false; }
  try {
    const r = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: {"Content-Type": "application/json", "X-Requested-With": "assistant-movers"},
      body: JSON.stringify(body || {})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || r.status);
    return j;
  } catch (e) {
    alert("Erreur : " + e.message);
    throw e;
  } finally { busy.hidden = true; }
}
async function act(path, body, libelle) { S = await api(path, body || {}, libelle); render(); }

function bind() {
  document.querySelectorAll("[data-m]").forEach((el) => {
    const k = el.dataset.m;
    if (mem[k] !== undefined) { if (el.type === "checkbox") el.checked = mem[k]; else el.value = mem[k]; }
    else if (el.type !== "checkbox") mem[k] = el.value;
    el.addEventListener("input", () => { mem[k] = el.type === "checkbox" ? el.checked : el.value; });
    el.addEventListener("change", () => { mem[k] = el.type === "checkbox" ? el.checked : el.value; });
  });
}
const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || "—")}</dd>`).join("")}</dl>`;
const fmt = (iso) => iso ? new Date(iso).toLocaleString("fr-FR", {weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}) : "—";
const hh = (iso) => new Date(iso).toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit"});

function render() {
  const d = S.dossier;
  $("#mode").textContent = S.demo ? "DÉMO · CRM FICTIF" : "CRM RÉEL";
  $("#mode").className = "badge " + (S.demo ? "demo" : "reel");
  $("#writes").textContent = `${S.ecritures} écriture(s) CRM`;
  $("#config-banner").textContent = (!S.demo && S.manquants.length)
    ? `Configuration incomplète : ${S.manquants.length} valeur(s) à relever avec « decouvrir ». Lecture possible, écritures bloquées.` : "";
  const i = S.etapes.indexOf(S.etape);
  $("#steps").innerHTML = S.etapes.map((e, k) =>
    `<div class="step ${k < i ? "done" : k === i ? "cur" : ""}"><span class="n">${k < i ? "✓" : k + 1}</span>${esc(S.libelles[e])}</div>`).join("");
  $("#journal").innerHTML = S.journal.map((l) => `<li class="${esc(l.niveau)}"><time>${esc(l.heure)}</time>${esc(l.message)}</li>`).join("");
  renderBlocage(d.blocage);
  ({compte: vCompte, adresse: vAdresse, case: vCase, wo: vWo, booking: vBooking, sms: vSms, email: vEmail, fin: vFin})[S.etape](d);
  bind();
}

function renderBlocage(b) {
  if (!b) { $("#blocage").innerHTML = ""; return; }
  const btns = [];
  if (b.reprise) {
    if (S.etape === "compte" && S.dossier.compte) btns.push(`<button class="dark small" data-a="avert">Continuer quand même</button>`);
    if (S.etape === "case" && S.dossier.case_id) btns.push(`<button class="dark small" data-a="reprendre">${S.demo ? "Simuler « Finish » puis reprendre" : "Reprendre"}</button>`);
    if (S.etape === "booking") btns.push(`<button class="dark small" data-a="${S.methode_booking === "action" ? "recharger" : "verifier"}">Reprendre</button>`);
    if (S.etape === "sms") btns.push(`<button class="dark small" data-a="forcer">Envoyer quand même</button>`);
  }
  $("#blocage").innerHTML = `<div class="alert ${b.reprise ? "warn" : "info"}"><b>${b.reprise ? "Arrêt — action requise" : "À corriger"}</b>${esc(b.message)}`
    + (b.action ? `<div>${esc(b.action)}</div>` : "") + (btns.length ? `<div class="actions">${btns.join("")}</div>` : "") + "</div>";
  $("#blocage").querySelectorAll("[data-a]").forEach((x) => x.onclick = () => ({
    avert: () => act("/api/avertissement", {}, "Validation…"),
    reprendre: () => act("/api/case/reprendre", {}, "Recherche du Work Order…"),
    recharger: () => act("/api/creneaux", {}, "Créneaux…"),
    verifier: () => act("/api/verifier", {}, "Lecture du WO…"),
    forcer: () => act("/api/sms", {texte: mem.sms, forcer: true}, "Envoi du SMS…"),
  })[x.dataset.a]());
}

function vCompte() {
  $("#view").innerHTML = `<h2>Client</h2><p class="lead">Saisissez le numéro client : l'assistant retrouve le compte dans le CRM.</p>
    <label for="num">Numéro client</label><input id="num" data-m="numero" inputmode="numeric" autocomplete="off" placeholder="${S.demo ? "Démo : 10000001 à 10000005" : "ex. 10031562"}">
    <div class="actions"><button class="primary" id="go">Rechercher le compte</button></div>
    ${S.dossier.compte ? `<div class="box">${kvCompte(S.dossier.compte)}</div>` : ""}`;
  const go = () => act("/api/compte", {numero: mem.numero}, "Recherche du compte…");
  $("#go").onclick = go;
  $("#num").onkeydown = (e) => { if (e.key === "Enter") { mem.numero = e.target.value; go(); } };
  setTimeout(() => $("#num").focus(), 0);
}
const kvCompte = (c) => kv([["Client", `${c.numero} — ${c.nom}`], ["Mobile", c.mobile], ["Email", c.email], ["Adresse actuelle", c.adresse]]);

function vAdresse(d) {
  const c = d.compte;
  const sel = (id, list, cur, lab) => list.length > 1
    ? `<label>${lab}</label><select data-m="${id}"><option value="">— choisir —</option>${list.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? "selected" : ""}>${esc(x.nom)}</option>`).join("")}</select>`
    : (list.length ? `<label>${lab}</label><input value="${esc(list[0].nom)}" disabled>` : "");
  $("#view").innerHTML = `<h2>Nouvelle adresse</h2><p class="lead">Là où le client emmène son alarme.</p>${kvCompte(c)}
    <div class="row">${sel("installation_id", c.installations, d.installation_id, "Installation qui déménage")}${sel("contrat_id", c.contrats, d.contrat_id, "Contrat")}</div>
    <label>Rue (numéro et voie)</label><input data-m="rue" autocomplete="off">
    <div class="row"><div><label>Code postal</label><input data-m="cp" inputmode="numeric" maxlength="5"></div>
    <div><label>Ville</label><input data-m="ville"></div>
    <div><label>Date de déménagement</label><input type="date" data-m="date"></div></div>
    <div class="actions"><button class="primary" id="go">Valider l'adresse</button></div>`;
  $("#go").onclick = () => act("/api/adresse", {rue: mem.rue, cp: mem.cp, ville: mem.ville, date: mem.date,
    installation_id: mem.installation_id || "", contrat_id: mem.contrat_id || ""}, "Contrôle…");
}

function vCase(d) {
  $("#view").innerHTML = `<h2>Case Movers</h2><p class="lead">Voici ce qui sera écrit dans le CRM. Rien ne part avant votre clic.</p>
    ${kv(S.apercu_case)}
    <div class="actions"><button class="primary" id="go" ${d.case_id ? "disabled" : ""}>Créer le case et lancer le Work Order</button>
    ${d.case_id ? `<span class="muted">Case ${esc(d.case_numero)} créé.</span>` : ""}</div>`;
  $("#go").onclick = () => act("/api/case", {}, "Création du case, attente du Work Order…");
}

function vWo(d) {
  if (mem.description === undefined) mem.description = S.description;
  const packs = S.packs.map((p, k) => `<label class="check"><input type="checkbox" data-m="pack${k}"> ${esc(p)}</label>`).join("");
  $("#view").innerHTML = `<h2>Work Order ${esc(d.wo.numero)}</h2><p class="lead">Créé par le CRM (${esc(d.wo.type_nom || "Installation")} · ${esc(d.wo.statut)}). Complétez-le.</p>
    <label>Description du WO</label><textarea data-m="description" rows="10"></textarea>
    <label>Produits à ajouter</label>${packs || `<p class="muted">Aucun pack configuré : ajoutez les produits dans le CRM.</p>`}
    <label class="check"><input type="checkbox" data-m="prodok"> Produits vérifiés dans le CRM (prix, service code)</label>
    <div class="actions"><button class="primary" id="go">Compléter le WO et passer au rendez-vous</button></div>`;
  $("#go").onclick = () => act("/api/wo", {description: mem.description, packs: S.packs.filter((_, k) => mem["pack" + k]),
    produits_verifies: !!mem.prodok}, "Mise à jour du WO…");
}

function vBooking(d) {
  const action = S.methode_booking === "action";
  const slots = d.creneaux.map((c) => `<button class="slot ${c.id === choix ? "sel" : ""}" data-id="${esc(c.id)}">
      ${esc(fmt(c.debut).split(" ").slice(0, 2).join(" "))}<small>${esc(hh(c.debut))} – ${esc(hh(c.fin))}</small></button>`).join("");
  $("#view").innerHTML = `<h2>Rendez-vous technicien</h2>
    ${action ? `<p class="lead">Créneaux renvoyés par le CRM pour le WO ${esc(d.wo.numero)}. Choisissez-le avec le client.</p>
      <div class="slots">${slots || '<p class="muted">Aucun créneau chargé.</p>'}</div>
      <div class="actions"><button class="primary" id="go" ${choix ? "" : "disabled"}>Réserver ce créneau</button><button id="reload">Recharger</button></div>`
    : `<p class="lead">La fiche du WO ${esc(d.wo.numero)} est ouverte dans Edge (période de recherche déjà remplie).</p>
      <div class="alert info"><b>À faire dans le CRM</b>« Get appointments » → choisissez le créneau avec le client → validez. Revenez ici ensuite.</div>
      <div class="actions"><button class="primary" id="verif">Vérifier la réservation</button></div>`}
    <div class="box"><b>Pas de créneau ? Demande No Cap</b>
      <label>Disponibilités du client</label><input data-m="dispos" placeholder="ex. 7/12, 14/12, pas avant 10h">
      <div class="actions"><button class="small" id="nocap">Préparer le message Teams</button></div>
      ${noCap ? `<pre>${esc(noCap)}</pre><div class="actions"><button class="small" id="copync">Copier</button>
      <span class="muted small">À poster dans « MO TO/Planning et No Cap ».</span></div>` : ""}</div>`;
  document.querySelectorAll(".slot").forEach((b) => b.onclick = () => { choix = b.dataset.id; vBooking(d); bind(); });
  if (action) {
    $("#go").onclick = () => act("/api/reserver", {creneau_id: choix}, "Réservation…");
    $("#reload").onclick = () => act("/api/creneaux", {}, "Créneaux…");
  } else $("#verif").onclick = () => act("/api/verifier", {}, "Lecture du WO…");
  $("#nocap").onclick = async () => { noCap = (await api("/api/nocap", {dispos: mem.dispos}, "…")).message; vBooking(d); bind(); };
  if ($("#copync")) $("#copync").onclick = () => navigator.clipboard.writeText(noCap);
}

function vSms(d) {
  if (mem.sms === undefined) mem.sms = d.sms_texte;
  $("#view").innerHTML = `<h2>SMS de confirmation</h2><p class="lead">Rendez-vous réservé : <b>${esc(fmt(d.wo.debut))}</b> → ${esc(hh(d.wo.fin))}. Relisez puis envoyez.</p>
    ${kv([["Destinataire", d.compte.mobile], ["WO", `${d.wo.numero} — ${d.wo.statut}`]])}
    <label>Texte du SMS</label><textarea data-m="sms" rows="4"></textarea>
    <p class="muted small" id="cnt"></p>
    <div class="actions"><button class="primary" id="go">Envoyer le SMS</button></div>`;
  const cnt = () => { $("#cnt").textContent = `${(mem.sms || "").length} caractères`; };
  setTimeout(() => { cnt(); document.querySelector("[data-m=sms]").addEventListener("input", cnt); }, 0);
  $("#go").onclick = () => act("/api/sms", {texte: mem.sms}, "Envoi du SMS…");
}

function vEmail(d) {
  const f = (k, lab, ph) => `<div><label>${lab}</label><input data-m="e_${k}" placeholder="${esc(ph)}"></div>`;
  $("#view").innerHTML = `<h2>Email récapitulatif</h2><p class="lead">Modèle CRM, envoyé depuis la file Movers. Date et tranche reprises du WO.</p>
    <div class="row">${f("duree", "Durée (minutes)", "ex. 120")}${f("electricite", "Électricité sur place", "oui / non")}${f("reseau", "Réseau", "GSM / Wifi")}</div>
    <div class="row">${f("travaux", "Travaux prévus", "ex. Pas de travaux")}${f("materiel", "Matériel à réinstaller", "ex. 1x DOC, 2x sirène")}</div>
    <div class="actions"><button class="dark" id="prep">Préparer l'email</button>
    <button class="primary" id="go" ${d.email_html && !S.email_zones.length ? "" : "disabled"}>Envoyer l'email</button></div>
    ${d.email_html ? `${S.email_zones.length ? `<div class="alert warn" style="margin-top:14px"><b>Encore surligné</b>${esc(S.email_zones.join(" · "))}</div>` : ""}
      <p class="muted" style="margin-top:14px">Objet : <b>${esc(d.email_sujet)}</b></p><iframe sandbox="" id="prev"></iframe>` : ""}`;
  if ($("#prev")) $("#prev").srcdoc = d.email_html;
  const vals = () => Object.fromEntries(["duree", "electricite", "reseau", "travaux", "materiel"].map((k) => [k, mem["e_" + k] || ""]));
  $("#prep").onclick = () => act("/api/email/preparer", vals(), "Préparation de l'email…");
  $("#go").onclick = () => act("/api/email/envoyer", {}, "Envoi de l'email…");
}

function vFin() {
  $("#view").innerHTML = `<h2>Dossier terminé ✓</h2><p class="lead">Compte rendu à copier dans vos notes.</p><pre id="cr">${esc(S.compte_rendu)}</pre>
    <div class="actions"><button class="dark" id="copy">Copier le compte rendu</button><button class="primary" id="new">Nouveau dossier</button></div>`;
  $("#copy").onclick = () => navigator.clipboard.writeText(S.compte_rendu);
  $("#new").onclick = nouveau;
}

async function nouveau() {
  if (S && S.etape !== "compte" && S.etape !== "fin" && !confirm("Abandonner le dossier en cours ? (rien n'est annulé dans le CRM)")) return;
  for (const k of Object.keys(mem)) delete mem[k];
  choix = ""; noCap = "";
  await act("/api/nouveau", {}, "…");
}
$("#btn-nouveau").onclick = nouveau;
api("/api/etat").then((j) => { S = j; render(); });
