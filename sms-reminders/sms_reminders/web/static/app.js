// No inline script: the Content-Security-Policy forbids it.

// Auto-submit (confirmation checkboxes, filters). Removing a confirmation asks first.
document.addEventListener("change", (event) => {
  const el = event.target;
  if (!el.classList || !el.classList.contains("js-autosubmit")) return;
  if (el.type === "checkbox" && el.name === "confirmed" && !el.checked) {
    const ok = window.confirm(
      "Retirer la confirmation ? Aucune relance ne sera relancée automatiquement : la reprise devra être validée sur la fiche."
    );
    if (!ok) { el.checked = true; return; }
  }
  el.form.submit();
});

// Live character / segment estimate in the template editor (the server re-validates).
const GSM = new Set(("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà").split(""));
const GSM_EXT = new Set("^{}\\[~]|€\f".split(""));
function estimate(text) {
  const chars = Array.from(text);
  const gsm = chars.every((c) => GSM.has(c) || GSM_EXT.has(c));
  const units = gsm ? chars.reduce((n, c) => n + (GSM_EXT.has(c) ? 2 : 1), 0) : text.length;
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { chars: chars.length, encoding: gsm ? "GSM-7" : "UCS-2", segments };
}
document.querySelectorAll(".js-sms-counter").forEach((area) => {
  const out = document.getElementById(area.dataset.target);
  const update = () => {
    const e = estimate(area.value);
    out.textContent = `${e.chars} caractères (variables non remplacées) · ${e.encoding} · ~${e.segments} segment(s). ` +
      "L'aperçu après enregistrement calcule la taille réelle avec les variables.";
  };
  area.addEventListener("input", update);
  update();
});

// Expired-reminder pop-up: shown as a modal, refreshed every 30 s without reloading the page.
const LATE_SNOOZE_KEY = "relances-late-snooze";
function lateSnoozed() {
  try { return Date.now() < Number(sessionStorage.getItem(LATE_SNOOZE_KEY) || 0); } catch { return false; }
}
function showLateDialog() {
  const dialog = document.getElementById("late-dialog");
  if (!dialog) return;
  if (lateSnoozed()) { dialog.close(); return; }
  if (dialog.open && !dialog.matches(":modal")) { dialog.close(); }
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
}
document.addEventListener("click", (event) => {
  if (!event.target.closest(".js-late-later")) return;
  try { sessionStorage.setItem(LATE_SNOOZE_KEY, String(Date.now() + 10 * 60 * 1000)); } catch {}
  document.getElementById("late-dialog")?.close();
});
async function pollLate() {
  if (lateSnoozed() || document.getElementById("late-dialog")?.open) return;
  try {
    const r = await fetch("/late/pending.json", { credentials: "same-origin" });
    if (!r.ok || !(await r.json()).count) return;
    const html = await (await fetch("/late/dialog?next=" + encodeURIComponent(location.pathname + location.search))).text();
    document.getElementById("late-dialog")?.remove();
    document.body.insertAdjacentHTML("beforeend", html);
    showLateDialog();
  } catch {}
}
if (document.body.dataset.latePoll) {
  showLateDialog();
  setInterval(pollLate, 30000);
}

// Desktop application: confirm before quitting (reminders stop until the next launch).
document.addEventListener("submit", (event) => {
  if (!event.target.classList.contains("js-quit")) return;
  if (!window.confirm("Quitter Relances SMS ? Les relances ne partiront plus jusqu'au prochain lancement.")) {
    event.preventDefault();
  }
});
