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
