/**
 * Assemble la page de l'artefact claude.ai à partir du build dist-artifact/ :
 * titre, styles et script intégrés (pas de doctype ni de <html> : la plateforme les ajoute).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-artifact/', import.meta.url);
const js = readFileSync(new URL('app.js', dir), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(new URL('app.css', dir), 'utf8');
const icon = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');

const page = `<title>English Coach</title>
<meta name="description" content="Apprendre l'anglais écrit en 90 jours : leçons courtes, révisions espacées et professeur IA.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<style>
${css}
/* Artefact : la plateforme ajoute déjà la marge de sécurité du haut à la page. */
.page { padding-top: 12px; }
</style>
<div id="root"></div>
<script>
${js}
</script>
`;
writeFileSync(new URL('english-coach.html', dir), page);
console.log(`dist-artifact/english-coach.html : ${(page.length / 1024).toFixed(0)} Kio`);
