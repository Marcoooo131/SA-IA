/* Workshop « Sector Alarm face à la concurrence » – moteur de présentation.
   Slides 1920×1080 mises à l'échelle, révélations progressives, corrections,
   notes, minuteur, plein écran, impression PDF. Aucune dépendance. */
(function () {
  'use strict';
  var D = window.WORKSHOP;
  var icon = window.icon || function () { return ''; };
  var deck = document.getElementById('deck');
  var TOTAL = 6;
  var STATUS = { ok: 'Inclus', opt: 'Option / conditions', no: 'Non inclus', na: 'Info non disponible' };

  var S = { i: 0, shown: {}, all: false, sit: 0, gaps: false };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- Gabarit commun ---------- */
  function frame(n, cls, inner) {
    return '<section class="slide ' + cls + '" data-index="' + n + '" aria-label="Slide ' + (n + 1) + '">' +
      '<header class="sbar"><span class="sbar__brand">' + icon('shield') + '<b>Workshop Movers</b> · ' + esc(D.title) + '</span>' +
      '<span class="sbar__num">' + String(n + 1).padStart(2, '0') + ' / ' + String(TOTAL).padStart(2, '0') + '</span></header>' +
      inner + '</section>';
  }
  function revealBtn(group, label) {
    return '<button type="button" class="rbtn" data-reveal="' + group + '">' + icon('eye') + '<span>' + esc(label) + '</span></button>';
  }

  /* ---------- Slide 1 ---------- */
  function s1() {
    var I = D.intro;
    var saved = [0, 1, 2].map(function (k) { return store('wc-crit-' + k) || ''; });
    return frame(0, 's1',
      '<div class="s1__grid">' +
        '<div class="s1__left">' +
          '<p class="kicker">' + esc(I.kicker) + '</p>' +
          '<h1 class="h1">SECTOR ALARM <span class="red">VS</span><br>LA CONCURRENCE</h1>' +
          '<blockquote class="hook">' + esc(I.hook) + '</blockquote>' +
          '<ul class="actors">' + I.actors.map(function (a, k) {
            return '<li class="actor' + (a.main ? ' actor--main' : '') + ' anim" style="--d:' + (0.15 + k * 0.08) + 's">' +
              '<span class="actor__ico">' + icon(a.main ? 'shieldCheck' : 'shield') + '</span>' +
              '<b>' + esc(a.name) + '</b><small>' + esc(a.tag) + '</small></li>';
          }).join('') + '</ul>' +
        '</div>' +
        '<div class="s1__right">' + house() + '</div>' +
      '</div>' +
      '<div class="ask">' +
        '<div class="ask__q"><span class="ask__badge">' + icon('help') + ' Question d\'ouverture</span><p>' + esc(I.question) + '</p></div>' +
        '<div class="ask__inputs">' + [0, 1, 2].map(function (k) {
          return '<label class="crit"><span>' + (k + 1) + '</span><input type="text" data-crit="' + k + '" placeholder="Critère ' + (k + 1) + '" value="' + esc(saved[k]) + '"></label>';
        }).join('') + '</div>' +
        '<div class="ask__hints">' + revealBtn('s1-hints', 'Pistes fréquemment citées') +
          '<ul class="frag" data-group="s1-hints">' + I.hints.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' +
        '</div>' +
      '</div>');
  }
  function house() {
    return '<svg class="house" viewBox="0 0 520 440" aria-hidden="true">' +
      '<defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef0f3"/></linearGradient></defs>' +
      '<circle cx="270" cy="210" r="200" fill="#f3f4f6"/>' +
      '<path d="M90 230 L270 90 L450 230" fill="none" stroke="#1f2329" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<rect x="125" y="220" width="290" height="190" rx="10" fill="url(#hg)" stroke="#1f2329" stroke-width="10"/>' +
      '<rect x="245" y="300" width="58" height="110" rx="6" fill="#1f2329"/>' +
      '<rect x="160" y="262" width="58" height="52" rx="6" fill="#dfe3e8" stroke="#1f2329" stroke-width="6"/>' +
      '<rect x="330" y="262" width="58" height="52" rx="6" fill="#dfe3e8" stroke="#1f2329" stroke-width="6"/>' +
      '<g class="house__shield"><path d="M420 92c18 13 38 20 56 20v44c0 36-24 58-56 68-32-10-56-32-56-68v-44c18 0 38-7 56-20z" fill="#E30613"/>' +
      '<path d="M398 158l15 15 30-32" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<g class="house__waves" fill="none" stroke="#E30613" stroke-width="6" stroke-linecap="round"><path d="M352 238a26 26 0 0 1 0-36"/><path d="M336 252a48 48 0 0 1 0-64"/></g>' +
      '<rect x="146" y="232" width="22" height="14" rx="4" fill="#E30613"/>' +
      '</svg>';
  }

  /* ---------- Slide 2 ---------- */
  function cell(c) {
    return '<span class="pill pill--' + c[0] + '" title="' + esc(STATUS[c[0]] || '') + '">' + esc(c[1]) + '</span>';
  }
  function s2() {
    var cols = D.columns;
    var head1 = '<tr><th class="rowlab" rowspan="2"><span class="th-title">Prestations</span></th>' + cols.map(function (c) {
      return '<th colspan="' + c.sub.length + '" class="colhead' + (c.main ? ' colhead--main' : '') + '">' + esc(c.name) + '</th>';
    }).join('') + '</tr>';
    var head2 = '<tr>' + cols.map(function (c) {
      return c.sub.map(function (s, k) {
        return '<th class="subhead' + (c.main ? ' subhead--main' : '') + (k === 0 ? ' grp' : '') + '">' + esc(s) + '</th>';
      }).join('');
    }).join('') + '</tr>';
    var body = D.rows.map(function (r) {
      return '<tr class="' + (r.key ? 'key' : '') + '"><th class="rowlab">' + esc(r.label) + '</th>' + r.cells.map(function (group, ci) {
        return group.map(function (c, k) {
          return '<td class="' + (cols[ci].main ? 'main' : '') + (k === 0 ? ' grp' : '') + '">' + cell(c) + '</td>';
        }).join('');
      }).join('') + '</tr>';
    }).join('');
    return frame(1, 's2',
      '<div class="s2__head"><h2 class="h2">Le comparatif concurrentiel</h2>' +
        '<div class="legend"><span class="pill pill--ok">Inclus</span><span class="pill pill--opt">Option / conditions</span><span class="pill pill--no">Non inclus</span><span class="pill pill--na">Info non disponible</span>' +
        '<button type="button" class="rbtn rbtn--dark" data-cmd="gaps" aria-pressed="false">' + icon('target') + '<span>Faire ressortir les écarts</span></button></div></div>' +
      '<table class="cmp' + (S.gaps ? ' is-gaps' : '') + '"><colgroup><col style="width:270px">' + cols.map(function (c) {
        return c.sub.map(function () { return '<col style="width:' + (c.main ? 240 : (c.sub.length === 1 ? 190 : 162)) + 'px">'; }).join('');
      }).join('') + '</colgroup><thead>' + head1 + head2 + '</thead><tbody>' + body + '</tbody></table>' +
      '<div class="tnotes">' + D.tableNotes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</div>');
  }

  /* ---------- Slide 3 ---------- */
  function s3() {
    var rows = [['wallet', 'Positionnement tarifaire', 'price'], ['clipboard', 'Principaux équipements', 'gear'], ['sparkles', 'Ce qui le différencie', 'plus'], ['alert', 'Limites (selon les infos disponibles)', 'limits']];
    return frame(2, 's3',
      '<div class="s3__head"><h2 class="h2">Comprendre le positionnement des concurrents</h2>' +
      '<p class="lead">Objectif : comprendre pourquoi un client peut être séduit par une autre offre.</p></div>' +
      '<div class="fiches">' + D.competitors.map(function (c, k) {
        return '<article class="fiche anim" style="--d:' + (0.1 + k * 0.08) + 's"><h3>' + esc(c.name) + '</h3>' +
          rows.map(function (r) {
            return '<div class="fiche__row' + (r[2] === 'limits' ? ' fiche__row--lim' : '') + '"><span class="fiche__lab">' + icon(r[0]) + esc(r[1]) + '</span><p>' + esc(c[r[2]]) + '</p></div>';
          }).join('') +
          '<div class="fiche__client">' + revealBtn('s3-' + k, 'Pourquoi un client peut la préférer') +
            '<p class="frag quote" data-group="s3-' + k + '">' + esc(c.client) + '</p></div>' +
          '</article>';
      }).join('') + '</div>');
  }

  /* ---------- Slide 4 ---------- */
  function s4() {
    return frame(3, 's4',
      '<div class="s4__head"><p class="kicker">Comment défendre Sector Alarm ?</p><h2 class="h2">NE PAS VENDRE UN PRIX, <span class="red">DÉFENDRE UNE VALEUR</span></h2></div>' +
      '<div class="steps">' + D.method.map(function (m, k) {
        return '<article class="step anim" style="--d:' + (0.1 + k * 0.1) + 's">' +
          '<div class="step__top"><span class="step__n">' + m.n + '</span><span class="step__ico">' + icon(m.icon) + '</span><h3>' + esc(m.title) + '</h3></div>' +
          '<p class="step__goal">' + esc(m.goal) + '</p>' +
          revealBtn('s4-' + k, 'Questions et réponse type') +
          '<div class="frag" data-group="s4-' + k + '">' +
            '<ul class="step__qs">' + m.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' +
            '<p class="step__ans"><b>Réponse possible</b>' + esc(m.answer) + '</p>' +
          '</div></article>' + (k < 2 ? '<span class="step__arrow">' + icon('arrowRight') + '</span>' : '');
      }).join('') + '</div>' +
      '<div class="proofs"><p class="proofs__title">' + icon('shieldCheck') + 'Ce que Sector Alarm affiche officiellement</p>' +
        '<ul>' + D.proofs.map(function (p) { return '<li>' + icon(p.icon) + '<span>' + esc(p.text) + '</span></li>'; }).join('') + '</ul>' +
        '<p class="proofs__check">' + icon('alert') + esc(D.toCheck) + '</p></div>');
  }

  /* ---------- Slide 5 ---------- */
  function s5(printSit) {
    var cur = printSit === undefined ? S.sit : printSit;
    var tabs = D.situations.map(function (s, k) {
      return '<button type="button" class="sit-tab' + (k === cur ? ' is-active' : '') + '" data-sit="' + k + '" role="tab" aria-selected="' + (k === cur) + '">' +
        '<span class="sit-tab__n">' + (k + 1) + '</span><span class="sit-tab__ico">' + icon(s.icon) + '</span><span>Situation ' + (k + 1) + '<b>' + esc(s.title) + '</b></span></button>';
    }).join('');
    var panels = D.situations.map(function (s, k) {
      if (printSit !== undefined && k !== printSit) return '';
      return '<div class="sit-panel" data-panel="' + k + '"' + (k === cur ? '' : ' hidden') + '>' +
        '<p class="sit-who">' + icon('user') + 'Le client</p>' +
        '<blockquote class="sit-quote">« ' + esc(s.quote) + ' »</blockquote>' +
        '<div class="sit-rules"><span>' + icon('users') + 'Un agent joue le client, un autre le conseiller</span><span>' + icon('timer') + '2 min de jeu · 1 min de débrief</span><span class="must">' + icon('help') + 'Au moins 2 questions de découverte avant de répondre</span></div>' +
        '<div class="sit-reveals">' +
          '<div class="sit-box">' + revealBtn('s5-' + k + '-q', 'Questions de découverte') +
            '<ul class="frag" data-group="s5-' + k + '-q">' + s.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' +
          '<div class="sit-box">' + revealBtn('s5-' + k + '-a', 'Éléments de réponse') +
            '<p class="frag" data-group="s5-' + k + '-a">' + esc(s.answer) + '</p></div>' +
          '<div class="sit-box sit-box--watch">' + revealBtn('s5-' + k + '-w', 'Point de vigilance') +
            '<p class="frag" data-group="s5-' + k + '-w">' + esc(s.watch) + '</p></div>' +
        '</div></div>';
    }).join('');
    return frame(4, 's5' + (printSit !== undefined ? ' print-only' : ''),
      '<div class="s5__head"><p class="kicker">Mise en situation · en binôme</p><h2 class="h2">À VOUS DE JOUER !</h2></div>' +
      '<div class="s5__grid"><div class="sit-tabs" role="tablist">' + tabs + '</div><div class="sit-panels">' + panels + '</div></div>');
  }

  /* ---------- Slide 6 ---------- */
  function s6() {
    return frame(5, 's6',
      '<div class="s6__head"><p class="kicker">Débrief et conclusion</p><h2 class="h2">LE MEILLEUR ARGUMENT, C\'EST CELUI<br>QUI <span class="red">RÉPOND AU BESOIN DU CLIENT</span></h2></div>' +
      '<ol class="rules">' + D.rules.map(function (r, k) {
        return '<li class="frag" data-group="s6-r' + k + '"><span>' + (k + 1) + '</span><p>' + esc(r) + '</p></li>';
      }).join('') + '</ol>' +
      '<div class="final"><div class="final__q"><span class="ask__badge">' + icon('help') + ' Question finale</span><p>' + esc(D.finalQuestion) + '</p></div>' +
        '<div class="final__h">' + revealBtn('s6-h', 'Exemples de premières questions') +
        '<ul class="frag" data-group="s6-h">' + D.finalHints.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div></div>' +
      '<p class="closing frag" data-group="s6-close">' + esc(D.closing) + '</p>');
  }

  /* ---------- Rendu et état ---------- */
  function build() {
    deck.innerHTML = s1() + s2() + s3() + s4() + s5() +
      D.situations.map(function (_, k) { return s5(k); }).join('') + s6();
    document.getElementById('dots').innerHTML = Array.from({ length: TOTAL }, function (_, k) {
      return '<li><button type="button" data-goto="' + k + '" aria-label="Slide ' + (k + 1) + '">' + (k + 1) + '</button></li>';
    }).join('');
    if (window.hydrateIcons) window.hydrateIcons(document);
    applyShown();
    show(S.i, true);
  }
  function slideEl(i) { return deck.querySelector('.slide:not(.print-only)[data-index="' + i + '"]'); }
  function visibleGroups(i) {
    var el = slideEl(i), seen = [], out = [];
    el.querySelectorAll('[data-group]').forEach(function (g) {
      if (g.closest('[hidden]')) return;
      var k = g.getAttribute('data-group');
      if (seen.indexOf(k) < 0) { seen.push(k); out.push(k); }
    });
    return out;
  }
  function applyShown() {
    deck.querySelectorAll('[data-group]').forEach(function (g) {
      var on = S.all || !!S.shown[g.getAttribute('data-group')];
      g.classList.toggle('is-shown', on);
    });
    deck.querySelectorAll('[data-reveal]').forEach(function (b) {
      var on = S.all || !!S.shown[b.getAttribute('data-reveal')];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-expanded', on);
    });
    var a = document.getElementById('btnAnswers');
    a.setAttribute('aria-pressed', S.all);
    a.classList.toggle('is-on', S.all);
  }
  function show(i, instant) {
    S.i = Math.max(0, Math.min(TOTAL - 1, i));
    deck.querySelectorAll('.slide:not(.print-only)').forEach(function (s) {
      var on = +s.getAttribute('data-index') === S.i;
      s.classList.toggle('is-current', on);
      if (on && !instant) { s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter'); }
    });
    document.querySelectorAll('#dots button').forEach(function (b, k) {
      b.classList.toggle('is-current', k === S.i);
      if (k === S.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    document.getElementById('notesText').textContent = D.notes[S.i] || '';
    if (location.hash !== '#' + (S.i + 1)) history.replaceState(null, '', '#' + (S.i + 1));
  }
  function next() {
    if (!S.all) {
      var pending = visibleGroups(S.i).filter(function (k) { return !S.shown[k]; });
      if (pending.length) { S.shown[pending[0]] = true; applyShown(); return; }
    }
    if (S.i < TOTAL - 1) show(S.i + 1);
  }
  function prev() { if (S.i > 0) show(S.i - 1); }
  function selectSit(k) {
    S.sit = k;
    var sl = slideEl(4);
    sl.querySelectorAll('.sit-tab').forEach(function (t, j) { t.classList.toggle('is-active', j === k); t.setAttribute('aria-selected', j === k); });
    sl.querySelectorAll('.sit-panel').forEach(function (p, j) { p.hidden = j !== k; });
  }

  /* ---------- Mise à l'échelle ---------- */
  function fit() {
    var bar = document.body.classList.contains('is-full') ? 0 : 64;
    var s = Math.min(window.innerWidth / 1920, (window.innerHeight - bar) / 1080);
    deck.style.transform = 'scale(' + s + ')';
    document.getElementById('stage').style.setProperty('--bar', bar + 'px');
  }

  /* ---------- Minuteur ---------- */
  var tId = null, tEnd = 0;
  function startTimer(secs) {
    var t = document.getElementById('timer'), v = document.getElementById('timerValue');
    clearInterval(tId); t.hidden = false; t.classList.remove('is-over');
    tEnd = Date.now() + secs * 1000;
    function tick() {
      var left = Math.max(0, Math.round((tEnd - Date.now()) / 1000));
      v.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (!left) { clearInterval(tId); t.classList.add('is-over'); }
    }
    tick(); tId = setInterval(tick, 250);
  }
  function stopTimer() { clearInterval(tId); document.getElementById('timer').hidden = true; }

  /* ---------- Commandes ---------- */
  function toggleFull() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else document.exitFullscreen();
  }
  function cmd(c, el) {
    switch (c) {
      case 'next': next(); break;
      case 'prev': prev(); break;
      case 'answers': S.all = !S.all; applyShown(); break;
      case 'notes': {
        var n = document.getElementById('notes'); n.hidden = !n.hidden;
        document.getElementById('btnNotes').setAttribute('aria-pressed', !n.hidden);
        document.getElementById('btnNotes').classList.toggle('is-on', !n.hidden);
        break;
      }
      case 'timer': startTimer(+el.getAttribute('data-secs')); break;
      case 'sources': document.getElementById('sources').hidden = false; break;
      case 'close': document.getElementById('sources').hidden = true; break;
      case 'print': window.print(); break;
      case 'fullscreen': toggleFull(); break;
      case 'gaps': {
        S.gaps = !S.gaps;
        deck.querySelector('.cmp').classList.toggle('is-gaps', S.gaps);
        el.setAttribute('aria-pressed', S.gaps); el.classList.toggle('is-on', S.gaps);
        break;
      }
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cmd],[data-reveal],[data-goto],[data-sit]');
    if (!b) return;
    if (b.hasAttribute('data-cmd')) cmd(b.getAttribute('data-cmd'), b);
    else if (b.hasAttribute('data-reveal')) { var k = b.getAttribute('data-reveal'); S.shown[k] = !S.shown[k]; applyShown(); }
    else if (b.hasAttribute('data-goto')) show(+b.getAttribute('data-goto'));
    else if (b.hasAttribute('data-sit')) selectSit(+b.getAttribute('data-sit'));
  });
  document.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-crit');
    if (k !== null && k !== undefined) store('wc-crit-' + k, e.target.value);
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.matches && e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (!document.getElementById('sources').hidden) { if (e.key === 'Escape') cmd('close'); return; }
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
      case 'Home': show(0); break;
      case 'End': show(TOTAL - 1); break;
      case 'f': case 'F': toggleFull(); break;
      case 'c': case 'C': cmd('answers'); break;
      case 'n': case 'N': cmd('notes'); break;
      case 'p': case 'P': cmd('print'); break;
      case 'Escape': stopTimer(); break;
      default:
        if (S.i === 4 && /^[1-4]$/.test(e.key)) selectSit(+e.key - 1);
    }
  });
  document.getElementById('timerClose').addEventListener('click', stopTimer);
  document.addEventListener('fullscreenchange', function () {
    document.body.classList.toggle('is-full', !!document.fullscreenElement); fit();
  });
  window.addEventListener('resize', fit);
  window.addEventListener('beforeprint', function () { document.body.classList.add('is-printing'); });
  window.addEventListener('afterprint', function () { document.body.classList.remove('is-printing'); });

  /* Masque les commandes en plein écran quand la souris ne bouge plus */
  var idle;
  document.addEventListener('mousemove', function () {
    document.body.classList.remove('is-idle'); clearTimeout(idle);
    idle = setTimeout(function () { document.body.classList.add('is-idle'); }, 2500);
  });

  document.getElementById('srcDate').textContent = D.sourcesDate;
  var h = parseInt((location.hash || '').slice(1), 10);
  if (h >= 1 && h <= TOTAL) S.i = h - 1;
  build();
  fit();
})();
