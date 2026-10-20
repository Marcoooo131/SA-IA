// Améliorateur Phone Call: the Python script of the desktop app, run in the browser (Pyodide).
// The transcript is only held in this page's memory: no network request, no storage.
"use strict";
const $ = (id) => document.getElementById(id);
let api = null;

function setStatus(text, cls) {
  const b = $("engine-status");
  b.textContent = text;
  b.className = "badge " + cls;
}

async function boot() {
  try {
    const pyodide = await loadPyodide({ indexURL: new URL("pyodide/", location.href).href });
    const files = await (await fetch("py/manifest.json", { cache: "no-store" })).json();
    for (const f of files) {
      const text = await (await fetch("py/" + f)).text();
      pyodide.FS.mkdirTree("/app/" + f.split("/").slice(0, -1).join("/"));
      pyodide.FS.writeFile("/app/" + f, text);
    }
    pyodide.runPython("import sys; sys.path.insert(0, '/app')");
    api = pyodide.pyimport("ameliorateur");
    $("run").disabled = false;
    setStatus("Prêt — traitement local", "ready");
  } catch (e) {
    console.error(e);
    setStatus("Erreur de chargement", "failed");
    showError("Le script n'a pas pu être chargé. Rechargez la page (Ctrl+F5).");
  }
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = !msg;
}

function run() {
  showError("");
  const text = $("input").value;
  if (!text.trim()) { showError("Collez d'abord une transcription."); return; }
  let r;
  try {
    r = JSON.parse(api.format_json(text, $("variant").value));
  } catch (e) {
    console.error(e);
    showError("La mise en forme a échoué : vérifiez le format de la transcription.");
    return;
  }
  if (r.error) { showError(r.error); return; }
  $("output").value = r.text;
  $("copy").disabled = !r.text;
  const flags = $("flags");
  flags.innerHTML = "";
  for (const f of r.flags || []) {
    if (f.severity === "info") continue;
    const li = document.createElement("li");
    li.className = f.severity;
    li.textContent = (f.severity === "blocking" ? "À corriger : " : "À vérifier : ") + f.message;
    flags.append(li);
  }
  for (const p of r.points_to_verify || []) {
    const li = document.createElement("li");
    li.textContent = "Point à confirmer : " + p;
    flags.append(li);
  }
}

async function copy() {
  const text = $("output").value;
  try { await navigator.clipboard.writeText(text); }
  catch { $("output").select(); document.execCommand("copy"); }
  $("copy").textContent = "Copiée ✓";
  setTimeout(() => { $("copy").textContent = "Copier la Phone Call"; }, 1500);
}

function clearAll() {
  $("input").value = "";
  $("output").value = "";
  $("flags").innerHTML = "";
  $("copy").disabled = true;
  showError("");
}

$("run").onclick = run;
$("copy").onclick = copy;
$("clear").onclick = clearAll;
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.ctrlKey && !$("run").disabled) run(); });
boot();
