// Copy-to-clipboard for the Phone Call text (no inline script: CSP forbids it).
document.addEventListener("click", async (event) => {
  const button = event.target.closest(".js-copy");
  if (!button) return;
  const field = document.getElementById(button.dataset.target);
  if (!field) return;
  try {
    await navigator.clipboard.writeText(field.value);
  } catch {
    field.select();
    document.execCommand("copy");
  }
  const label = button.textContent;
  button.textContent = "Copié ✓";
  setTimeout(() => (button.textContent = label), 1500);
});
