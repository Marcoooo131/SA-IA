// CRM DE TEST (générique, données fictives) : reproduit seulement les comportements utiles au
// parcours – recherche globale, fiche contrat, rubrique Termination Information, Save & Close.
// Il ne sert qu'à tester SAINT GRAAL sans toucher au vrai CRM.
import http from 'node:http';

export const CASE_REASONS = ['Customer Deceased', 'Moves to new address', 'SSE / B2B - End of business', 'Financial reasons'];
export const CASE_CATEGORIES = ['Termination', 'Downgrade'];

export function contratsInitiaux() {
  return {
    'C-SFR-00214829': { nom: 'Client Test A', nid: '10/11/2026', lid: '', cat: 'Termination', reason: '' },
    'C-SFR-00000417': { nom: 'Client Test B', nid: '25/11/2026', lid: '', cat: 'Termination', reason: '' },
    'C-SFR-00330001': { nom: 'Client Test C', nid: '04/11/2026', lid: '', cat: 'Termination', reason: '' },
    'C-SFR-00330002': { nom: 'Client Test D', nid: '15/11/2026', lid: '', cat: 'Termination', reason: '' },
    'C-SFR-00330004': { nom: 'Client Test E', nid: '20/11/2026', lid: '', cat: 'Termination', reason: '' },
  };
}

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CRM de test</title>
<style>body{font:14px system-ui;margin:0}header{background:#333;color:#fff;padding:8px;display:flex;gap:8px}
main{padding:16px}label{display:block;margin-top:8px;font-weight:600}section{border:1px solid #ccc;padding:8px;margin-top:12px}
[role=alert]{background:#fdd;padding:8px}</style></head><body>
<header><button type="button" id="open-search">Search</button>
<input type="search" aria-label="Search" id="q" hidden></header><main id="main">${body}</main>
<script>
const q=document.getElementById('q');
document.getElementById('open-search').onclick=()=>{q.hidden=false;q.focus();};
q.addEventListener('keydown',async e=>{ if(e.key!=='Enter')return;
  const r=await (await fetch('/api/search?q='+encodeURIComponent(q.value))).json();
  setTimeout(()=>{ document.getElementById('main').innerHTML = r.length
    ? '<ul>'+r.map(c=>'<li role="listitem"><a href="/contract/'+encodeURIComponent(c.num)+'">'+c.num+' – '+c.nom+'</a></li>').join('')+'</ul>'
    : '<p>No results</p>'; }, 300);
});
</script></body></html>`;

function fiche(num, c) {
  const opt = (liste, v) => '<option value="">---</option>' + liste.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('');
  return page(`<form id="f"><h1>Contract</h1>
<label for="num">Contract Number</label><input id="num" value="${num}" readonly>
<label for="nid">Next Invoice Date</label><input id="nid" value="${c.nid}" readonly>
<section><h2>Termination Information</h2>
<label for="lid">Last Income Date</label><input id="lid" value="${c.lid}">
<label for="cat">Case Category</label><select id="cat">${opt(CASE_CATEGORIES, c.cat)}</select>
<label for="reason">Case Reason</label><select id="reason">${opt(CASE_REASONS, c.reason)}</select>
</section><p><button type="button" id="save">Save &amp; Close</button></p></form>
<script>
document.getElementById('save').onclick=async()=>{
  const body={lid:lid.value,cat:cat.value,reason:reason.value};
  const r=await fetch('/api/contract/${encodeURIComponent(num)}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){ const d=document.createElement('div'); d.setAttribute('role','alert'); d.textContent=await r.text(); document.getElementById('f').prepend(d); return; }
  setTimeout(()=>{ location.href='/'; }, 400);
};
</script>`);
}

export function demarrerCrmTest(port = 0) {
  const contrats = contratsInitiaux();
  const ecritures = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    if (u.pathname === '/') return send(200, 'text/html', page('<p>Accueil CRM de test</p>'));
    if (u.pathname === '/api/search') {
      const qv = (u.searchParams.get('q') || '').trim();
      const r = Object.entries(contrats).filter(([n]) => n === qv).map(([num, c]) => ({ num, nom: c.nom }));
      return send(200, 'application/json', JSON.stringify(r));
    }
    const m = u.pathname.match(/^\/(api\/)?contract\/(.+)$/);
    if (m) {
      const num = decodeURIComponent(m[2]);
      const c = contrats[num];
      if (!c) return send(404, 'text/plain', 'not found');
      if (!m[1]) return send(200, 'text/html', fiche(num, c));
      let b = '';
      req.on('data', (x) => { b += x; });
      req.on('end', () => {
        const v = JSON.parse(b);
        if (v.lid && !/^\d{2}\/\d{2}\/\d{4}$/.test(v.lid)) return send(400, 'text/plain', 'Invalid date format');
        Object.assign(c, v);
        ecritures.push({ num, ...v });
        send(200, 'application/json', '{}');
      });
      return;
    }
    send(404, 'text/plain', 'not found');
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({
    url: `http://127.0.0.1:${srv.address().port}/`, contrats, ecritures, fermer: () => new Promise((f) => srv.close(f)),
  })));
}

if (process.argv[1]?.endsWith('crm-test-server.js')) {
  demarrerCrmTest(Number(process.argv[2] || 4778)).then((s) => console.log('CRM de test :', s.url));
}
