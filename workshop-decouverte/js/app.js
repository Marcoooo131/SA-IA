/*
 * Workshop « L'art de la découverte client » – application monopage sans dépendance.
 * Rendu : chaque écran est une fonction qui renvoie du HTML ; les interactions passent
 * par des attributs data-action (délégation d'événements sur #screen).
 */
(function () {
  'use strict';

  const D = window.WORKSHOP_DATA;
  const icon = window.icon;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const STORE_QUIZ = 'workshop-decouverte.quiz';
  const STORE_TEAM = 'workshop-decouverte.team';
  const STAGES = ['Contexte', 'Mauvaise approche', 'Questions', 'Opportunités', 'Conclusion'];

  /* ---------- Stockage local (facultatif : l'outil fonctionne sans) ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
    }
  };

  /* ---------- État ---------- */
  const freshSituations = () => D.situations.map(() => ({ stage: 0, questions: 0 }));
  const S = {
    step: 0,
    showAll: false,
    notes: false,
    opened: new Set(),          // clés des blocs révélés
    sitActive: 0,
    sit: freshSituations(),
    trIndex: 0,
    team: store.get(STORE_TEAM, {}),
    quiz: { phase: 'intro', rounds: [], i: 0 },
    quizStats: store.get(STORE_QUIZ, { best: null, last: null, plays: 0 })
  };
  let lastAnimated = null;      // bloc à animer au prochain rendu de situation

  /* ---------- Utilitaires ---------- */
  // Échappement HTML + espaces insécables de la typographie française (« … », ? ! : ;)
  const esc = (s) => String(s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    .replace(/ ([?!:;»])/g, '\u00a0$1')
    .replace(/« /g, '«\u00a0');
  const isOpen = (key) => S.showAll || S.opened.has(key);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const letters = ['A', 'B', 'C', 'D'];

  const revealBlock = (key, inner, extraClass) =>
    `<div class="reveal ${isOpen(key) ? 'is-open' : ''} ${extraClass || ''}" data-reveal-key="${key}"><div class="reveal__inner">${inner}</div></div>`;

  const revealButton = (key, labelClosed, labelOpen, ic) =>
    `<button class="btn btn--reveal ${isOpen(key) ? 'is-active' : ''}" type="button" data-action="reveal" data-key="${key}" aria-expanded="${isOpen(key)}" data-closed="${esc(labelClosed)}" data-open="${esc(labelOpen)}">
      ${icon(isOpen(key) ? 'eyeOff' : (ic || 'eye'))}<span>${esc(isOpen(key) ? labelOpen : labelClosed)}</span>
    </button>`;

  const timerButtons = () =>
    `<div class="timer-btns" role="group" aria-label="Lancer un temps de réflexion">
      ${icon('timer')}<span>Réflexion</span>
      <button type="button" class="chip-btn" data-action="timer" data-secs="30">30 s</button>
      <button type="button" class="chip-btn" data-action="timer" data-secs="60">1 min</button>
    </div>`;

  /* ---------- Voix du client (synthèse vocale du navigateur, aucun fichier ni serveur) ---------- */
  const STORE_SOUND = 'workshop-decouverte.sound';
  const voice = {
    supported: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    on: store.get(STORE_SOUND, true),
    pick() {
      const all = window.speechSynthesis.getVoices().filter((v) => /^fr(-|_|$)/i.test(v.lang));
      const pref = [/google/i, /natural|neural|online/i, /amélie|amelie|thomas|denise|henri|audrey|aurélie|julie/i];
      for (const re of pref) { const v = all.find((x) => re.test(x.name) && /fr[-_]FR/i.test(x.lang)) || all.find((x) => re.test(x.name)); if (v) return v; }
      return all.find((x) => /fr[-_]FR/i.test(x.lang)) || all[0] || null;
    },
    speak(text, btn) {
      if (!this.supported || !this.on) return;
      const synth = window.speechSynthesis;
      this.stop();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      const v = this.pick();
      if (v) u.voice = v;
      u.rate = 0.97;
      const bub = btn && btn.closest('.bubble');
      if (bub) bub.classList.add('is-speaking');
      u.onend = u.onerror = () => { if (bub) bub.classList.remove('is-speaking'); };
      synth.speak(u);
    },
    stop() {
      if (!this.supported) return;
      window.speechSynthesis.cancel();
      document.querySelectorAll('.bubble.is-speaking').forEach((b) => b.classList.remove('is-speaking'));
    }
  };
  // Chrome charge la liste des voix en différé
  if (voice.supported) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }

  const bubble = (who, text, cls) =>
    `<div class="bubble bubble--${who} ${cls || ''}">
      <span class="bubble__who">${icon(who === 'agent' ? 'headset' : 'user')}${who === 'agent' ? 'Conseiller' : 'Client'}</span>
      <p>${esc(text)}</p>
      ${who === 'client' && voice.supported ? `<button type="button" class="bubble__play" data-action="speak" data-text="${esc(text)}" aria-label="Écouter la réponse du client" title="Réécouter">${icon('volume')}</button>` : ''}
    </div>`;

  const header = (eyebrow, title, lead) =>
    `<header class="screen-head anim">
      <span class="eyebrow">${eyebrow}</span>
      <h1>${title}</h1>
      ${lead ? `<p class="lead">${lead}</p>` : ''}
    </header>`;

  /* ==========================================================================
     ÉCRAN 1 – INTRODUCTION
     ========================================================================== */
  function renderIntro() {
    const I = D.intro;
    const total = D.steps.reduce((n, s) => n + parseInt(s.duration, 10), 0);
    return `
    <section class="intro">
      <div class="intro__hero anim">
        <span class="eyebrow">${icon('sparkles')} Workshop Movers · Conservation client</span>
        <h1 class="intro__title">L'art de la <span class="accent">découverte</span> client</h1>
        <p class="intro__subtitle">${esc(I.subtitle)}</p>
      </div>

      <ol class="principles">
        ${I.principles.map((p, i) => `
          <li class="principle anim" style="--d:${120 + i * 110}ms">
            <span class="principle__num">0${i + 1}</span>
            <span class="principle__icon">${icon(p.icon)}</span>
            <h2><strong>${esc(p.title)}</strong> ${esc(p.rest)}</h2>
            <p>${esc(p.text)}</p>
          </li>`).join('')}
      </ol>

      <blockquote class="hook anim" style="--d:480ms">
        <span class="hook__mark" aria-hidden="true">«</span>
        <p>${esc(I.hook)}</p>
      </blockquote>

      <div class="intro__cta anim" style="--d:600ms">
        <button class="btn btn--primary btn--xl" type="button" data-action="goto" data-step="1">
          ${icon('play')}<span>Commencer le workshop</span>
        </button>
      </div>

      <div class="agenda anim" style="--d:720ms">
        <span class="agenda__title">${icon('flag')} Déroulé de la séance · ${total} min</span>
        <ol>
          ${D.steps.map((s, i) => `<li><button type="button" data-action="goto" data-step="${i}"><b>${i + 1}</b>${esc(s.label)}<em>${esc(s.duration)}</em></button></li>`).join('')}
        </ol>
      </div>
    </section>`;
  }

  /* ==========================================================================
     ÉCRAN 2 – OUVERTE / FERMÉE
     ========================================================================== */
  function compareCard(kind) {
    const c = D.comparison[kind];
    const key = 'cmp-' + kind;
    const label = kind === 'closed' ? 'Question fermée' : 'Question ouverte';
    return `
    <article class="compare compare--${kind} anim" style="--d:${kind === 'closed' ? 80 : 200}ms">
      <span class="tag tag--${kind}">${icon(kind === 'closed' ? 'x' : 'check')}${label}</span>
      ${bubble('agent', c.question)}
      ${revealBlock(key, `
        ${bubble('client', c.answer, kind === 'closed' ? 'bubble--short' : '')}
        <div class="meter" style="--gain:${c.gain}%">
          <div class="meter__head"><span>Information obtenue</span><b>${c.gain} %</b></div>
          <div class="meter__track"><div class="meter__fill"></div></div>
        </div>
        <p class="verdict">${esc(c.verdict)}</p>`)}
      <div class="compare__foot">
        ${S.showAll ? '' : revealButton(key, 'Écouter la réponse du client', 'Masquer la réponse', 'ear')}
      </div>
    </article>`;
  }

  function renderComparison() {
    const C = D.comparison;
    return `
    ${header('Étape 2 · Comprendre la différence', 'Question fermée <span class="vs">ou</span> question ouverte\u00a0?',
      "Même client, même situation. Seule la question change… et toute la conversation avec elle.")}

    <div class="compare-grid">${compareCard('closed')}${compareCard('open')}</div>

    <section class="block anim" style="--d:300ms">
      <div class="block__bar">
        <h2 class="h2">${icon('lightbulb')} Pourquoi la deuxième question est-elle plus intéressante ?</h2>
        ${S.showAll ? '' : revealButton('cmp-why', "Révéler l'explication", "Masquer l'explication", 'lightbulb')}
      </div>
      ${revealBlock('cmp-why', `<div class="why-grid">${C.why.map((w) => `
        <div class="why"><span class="why__icon">${icon(w.icon)}</span><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p></div>`).join('')}</div>`)}
    </section>

    <section class="words anim" style="--d:360ms">
      <div class="words__col words__col--open">
        <h3>${icon('check')} Les mots qui ouvrent</h3>
        <div class="chips">${C.openers.map((w) => `<span class="chip chip--open">${esc(w)}</span>`).join('')}</div>
      </div>
      <div class="words__col words__col--closed">
        <h3>${icon('x')} Les tournures qui ferment</h3>
        <div class="chips">${C.closers.map((w) => `<span class="chip chip--closed">${esc(w)}</span>`).join('')}</div>
      </div>
    </section>

    <section class="block block--plain anim" style="--d:420ms">
      <div class="block__bar">
        <h2 class="h2">${icon('repeat')} À vous : comment ouvririez-vous ces questions ?</h2>
        ${timerButtons()}
      </div>
      <div class="flip-grid">
        ${C.examples.map((ex, i) => {
          const key = 'ex-' + i;
          const o = isOpen(key);
          return `
          <article class="flip ${o ? 'is-flipped' : ''}" data-reveal-key="${key}">
            <div class="flip__closed">
              <span class="tag tag--closed">${icon('x')}Fermée</span>
              <p class="flip__q">«\u00a0${esc(ex.closed)}\u00a0»</p>
            </div>
            <div class="flip__arrow">${icon('arrowRight')}</div>
            <div class="flip__open">
              <span class="tag tag--open">${icon('check')}Ouverte</span>
              <p class="flip__q">«\u00a0${esc(ex.open)}\u00a0»</p>
              <p class="flip__insight">${esc(ex.insight)}</p>
            </div>
            ${S.showAll ? '' : `<button class="btn btn--small ${o ? 'btn--ghost' : 'btn--dark'}" type="button" data-action="reveal" data-key="${key}" aria-expanded="${o}" data-closed="Transformer" data-open="Revenir à la question fermée">
              ${icon(o ? 'rotate' : 'repeat')}<span>${o ? 'Revenir à la question fermée' : 'Transformer'}</span></button>`}
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }

  /* ==========================================================================
     ÉCRAN 3 – MISES EN SITUATION
     ========================================================================== */
  function situationDone(i) { return S.showAll || S.sit[i].stage >= STAGES.length - 1; }

  function renderSituations() {
    return `
    ${header('Étape 3 · Mises en situation Movers', 'Les 4 situations pratiques',
      "Lisez le contexte, faites réfléchir l'équipe, puis révélez pas à pas les questions, les réponses du client et les opportunités.")}
    <div class="sit-tabs anim" role="tablist" aria-label="Choisir une situation">
      ${D.situations.map((s, i) => `
        <button class="sit-tab ${i === S.sitActive ? 'is-active' : ''} ${situationDone(i) ? 'is-done' : ''}" type="button" role="tab"
          aria-selected="${i === S.sitActive}" data-action="sit-select" data-index="${i}">
          <span class="sit-tab__icon">${icon(s.icon)}</span>
          <span class="sit-tab__text"><small>Situation ${i + 1}</small><strong>${esc(s.title)}</strong><em>${esc(s.teaser)}</em></span>
          <span class="sit-tab__done" aria-label="Terminée">${icon('check')}</span>
        </button>`).join('')}
    </div>
    <div id="sitPanel">${renderSituationPanel()}</div>`;
  }

  function renderSituationPanel() {
    const i = S.sitActive;
    const s = D.situations[i];
    const st = S.sit[i];
    const stage = S.showAll ? STAGES.length - 1 : st.stage;
    const shownQ = S.showAll ? s.questions.length : st.questions;
    const anim = (name) => (lastAnimated === name ? 'anim' : '');
    const k = (name) => `s${i}-${name}`;

    let html = `
    <article class="sit-panel ${lastAnimated === 'panel' ? 'anim' : ''}">
      <header class="sit-panel__head">
        <span class="sit-panel__icon">${icon(s.icon)}</span>
        <div>
          <span class="eyebrow">Situation ${i + 1} / ${D.situations.length}</span>
          <h2>${esc(s.title)}</h2>
        </div>
        <ol class="stages" aria-label="Avancement de la situation">
          ${STAGES.map((name, n) => `<li class="${n <= stage ? 'is-on' : ''}"><span></span>${name}</li>`).join('')}
        </ol>
      </header>

      <div class="sit-block sit-block--ctx">
        <div class="ctx">
          <span class="label">${icon('user')} Contexte client</span>
          <p>${esc(s.context)}</p>
        </div>
        <div class="ctx ctx--goal">
          <span class="label">${icon('target')} Objectif de l'agent</span>
          <p>${esc(s.goal)}</p>
        </div>
      </div>`;

    if (stage >= 1) {
      html += `
      <div class="sit-block ${anim('bad')}">
        <span class="label label--bad">${icon('alert')} Mauvaise approche à éviter</span>
        <div class="bad">
          ${bubble('agent', s.badApproach, 'bubble--bad')}
          <div class="bad__why">
            ${S.showAll ? '' : revealButton(k('bad'), "Pourquoi l'éviter ?", "Masquer l'explication", 'help')}
            ${revealBlock(k('bad'), `<p class="bad__text">${esc(s.badWhy)}</p>`)}
          </div>
        </div>
      </div>`;
    }

    if (stage >= 2) {
      html += `
      <div class="sit-block ${anim('questions')}">
        <div class="block__bar">
          <span class="label label--good">${icon('message')} Questions ouvertes</span>
          ${timerButtons()}
        </div>
        ${shownQ === 0 ? `<div class="prompt">${icon('users')}<p><strong>À vous de jouer.</strong> Quelles questions ouvertes poseriez-vous à ce client ? Proposez vos formulations avant de révéler celles du support.</p></div>` : ''}
        <ol class="qlist">
          ${s.questions.slice(0, shownQ).map((q, n) => {
            const key = k('a' + n);
            return `
            <li class="qitem ${lastAnimated === 'q' + n ? 'anim' : ''}">
              <span class="qitem__num">${n + 1}</span>
              <div class="qitem__body">
                <p class="qitem__q">«\u00a0${esc(q.q)}\u00a0»</p>
                ${revealBlock(key, `
                  ${bubble('client', q.a)}
                  <p class="insight">${icon('lightbulb')}<span><b>À repérer :</b> ${esc(q.insight)}</span></p>`)}
                ${S.showAll ? '' : revealButton(key, 'Réponse du client', 'Masquer la réponse', 'message')}
              </div>
            </li>`;
          }).join('')}
        </ol>
        ${shownQ < s.questions.length ? `
          <button class="btn btn--outline" type="button" data-action="sit-next-q">
            ${icon('eye')}<span>Révéler la question ${shownQ + 1} / ${s.questions.length}</span>
          </button>` : ''}
      </div>`;
    }

    if (stage >= 3) {
      const key = k('opps');
      html += `
      <div class="sit-block ${anim('opps')}">
        <div class="block__bar">
          <span class="label label--good">${icon('shieldCheck')} Opportunités de conservation</span>
          ${S.showAll ? '' : timerButtons()}
        </div>
        ${isOpen(key) ? '' : `<div class="prompt">${icon('search')}<p><strong>Qu'avez-vous repéré ?</strong> Quelles opportunités de conservation ces réponses font-elles émerger ?</p></div>`}
        ${revealBlock(key, `<div class="opps">${s.opportunities.map((o, n) => `
          <div class="opp" style="--d:${n * 70}ms"><span>${icon('check')}</span><div><strong>${esc(o.title)}</strong><p>${esc(o.text)}</p></div></div>`).join('')}</div>`)}
        ${S.showAll ? '' : revealButton(key, 'Révéler les opportunités', 'Masquer les opportunités', 'sparkles')}
      </div>`;
    }

    if (stage >= 4) {
      html += `
      <div class="sit-block sit-block--end ${anim('end')}">
        <div class="synthesis">
          <span class="label">${icon('repeat')} Reformulation de synthèse</span>
          <p>${esc(s.synthesis)}</p>
        </div>
        <div class="lesson">
          <span class="label">${icon('flag')} À retenir</span>
          <p>${esc(s.conclusion)}</p>
        </div>
      </div>`;
    }

    // Pied : étape suivante ou situation suivante
    let foot;
    if (stage < STAGES.length - 1) {
      const blocked = stage === 2 && shownQ < s.questions.length;
      foot = `<button class="btn btn--primary" type="button" data-action="sit-next-stage" ${blocked ? 'data-soft="1"' : ''}>
        <span>Étape suivante : ${STAGES[stage + 1]}</span>${icon('arrowRight')}</button>`;
    } else if (i < D.situations.length - 1) {
      foot = `<button class="btn btn--primary" type="button" data-action="sit-select" data-index="${i + 1}">
        <span>Situation ${i + 2} : ${esc(D.situations[i + 1].title)}</span>${icon('arrowRight')}</button>`;
    } else {
      foot = `<button class="btn btn--primary" type="button" data-action="goto" data-step="3">
        <span>Passer à l'exercice collectif</span>${icon('arrowRight')}</button>`;
    }
    html += `<footer class="sit-panel__foot">${foot}</footer></article>`;
    return html;
  }

  /* ==========================================================================
     ÉCRAN 4 – TRANSFORME TA QUESTION !
     ========================================================================== */
  function renderTransform() {
    const n = S.trIndex;
    const t = D.transform[n];
    const key = 'tr-' + n;
    const open = isOpen(key);
    return `
    ${header('Étape 4 · Exercice collectif', 'Transforme ta question !',
      "Une question fermée s'affiche. À l'équipe de proposer, à l'oral, une version ouverte. Puis on compare avec une proposition de reformulation.")}

    <div class="pager anim" role="tablist" aria-label="Questions de l'exercice">
      ${D.transform.map((_, j) => `<button type="button" role="tab" class="pager__dot ${j === n ? 'is-active' : ''} ${isOpen('tr-' + j) ? 'is-done' : ''}" aria-selected="${j === n}" data-action="tr-go" data-index="${j}">${j + 1}</button>`).join('')}
    </div>

    <article class="transform anim" style="--d:80ms">
      <div class="transform__closed">
        <span class="tag tag--closed">${icon('x')}Question fermée ${n + 1} / ${D.transform.length}</span>
        <p class="transform__q">«\u00a0${esc(t.closed)}\u00a0»</p>
        <p class="transform__hint">Réponse probable : « Oui. » / « Non. » … et la conversation s'arrête.</p>
      </div>

      <div class="transform__think">
        <div class="block__bar">
          <span class="label">${icon('users')} Espace de réflexion</span>
          ${timerButtons()}
        </div>
        <label class="team-input">
          <span>${icon('pen')} Proposition de l'équipe <em>(facultatif, conservée sur cet appareil)</em></span>
          <textarea id="teamText" rows="2" placeholder="Notez ici la meilleure formulation proposée par l'équipe…">${esc(S.team[n] || '')}</textarea>
        </label>
      </div>

      <div class="transform__reveal ${open ? 'is-open' : ''}" data-reveal-key="${key}">
        ${open ? `
          <div class="burst" aria-hidden="true">${Array.from({ length: 10 }, (_, j) => `<i style="--a:${j * 36}deg"></i>`).join('')}</div>
          <span class="tag tag--open">${icon('sparkles')}Proposition de reformulation</span>
          <ul class="proposals">
            ${t.proposals.map((p, j) => `<li style="--d:${120 + j * 160}ms">«\u00a0${esc(p)}\u00a0»</li>`).join('')}
          </ul>
          <p class="insight">${icon('lightbulb')}<span>${esc(t.tip)}</span></p>` : ''}
      </div>

      <div class="transform__actions">
        ${S.showAll ? '' : (open
          ? `<button class="btn btn--ghost" type="button" data-action="tr-hide">${icon('eyeOff')}<span>Masquer</span></button>`
          : `<button class="btn btn--primary btn--lg" type="button" data-action="tr-reveal">${icon('sparkles')}<span>Révéler une reformulation</span></button>`)}
        ${n < D.transform.length - 1
          ? `<button class="btn btn--outline" type="button" data-action="tr-go" data-index="${n + 1}"><span>Question suivante</span>${icon('arrowRight')}</button>`
          : `<button class="btn btn--outline" type="button" data-action="goto" data-step="4"><span>Passer au challenge final</span>${icon('arrowRight')}</button>`}
      </div>
    </article>`;
  }

  /* ==========================================================================
     ÉCRAN 5 – CHALLENGE FINAL (QUIZ)
     ========================================================================== */
  function newQuiz() {
    const picks = shuffle(D.quiz.map((_, i) => i)).slice(0, 3);
    S.quiz = {
      phase: 'play',
      i: 0,
      rounds: picks.map((idx) => ({ idx, order: shuffle(D.quiz[idx].options.map((_, j) => j)), chosen: null }))
    };
  }

  const quizScore = () => S.quiz.rounds.filter((r) => r.chosen !== null && D.quiz[r.idx].options[r.chosen].correct).length;

  function renderChallenge() {
    const Q = S.quiz;
    const stats = S.quizStats;
    const head = header('Étape 5 · Le challenge final', 'Saurais-tu conserver ce client ?',
      'Trois situations tirées au hasard. Pour chacune, choisissez la meilleure question à poser.');

    if (Q.phase === 'intro') {
      return `${head}
      <article class="quiz-start anim" style="--d:80ms">
        <span class="quiz-start__icon">${icon('trophy')}</span>
        <h2>Prêts pour le challenge ?</h2>
        <p>Votez à main levée pour A, B ou C avant de valider. Chaque bonne réponse rapporte un point.</p>
        <div class="stats">
          <div><b>${stats.best === null ? '–' : stats.best + ' / 3'}</b><span>Meilleur score</span></div>
          <div><b>${stats.last === null ? '–' : stats.last + ' / 3'}</b><span>Dernière partie</span></div>
          <div><b>${stats.plays}</b><span>Parties jouées</span></div>
        </div>
        <button class="btn btn--primary btn--xl" type="button" data-action="quiz-start">${icon('play')}<span>Lancer le challenge</span></button>
      </article>`;
    }

    if (Q.phase === 'results') {
      const score = quizScore();
      const msg = [
        ['On rejoue ?', "Les questions fermées ont la vie dure. Reprenez les mots qui ouvrent : « comment », « qu'est-ce qui », « quels »."],
        ['Bon début', 'Le réflexe se construit. Méfiez-vous des solutions proposées trop tôt.'],
        ['Très bien joué', 'Vous savez faire parler le client. Encore un effort pour un sans-faute !'],
        ['Sans-faute !', 'Vous laissez le client trouver lui-même les raisons de rester. Bravo.']
      ][score];
      return `${head}
      <article class="results anim">
        <div class="ring" style="--p:${(score / 3) * 100}">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring__track" cx="60" cy="60" r="52"/><circle class="ring__fill" cx="60" cy="60" r="52"/></svg>
          <div class="ring__value"><b>${score}</b><span>/ 3</span></div>
        </div>
        <div class="results__text">
          <h2>${msg[0]}</h2>
          <p>${msg[1]}</p>
          <p class="results__best">${icon('trophy')} Meilleur score : <b>${stats.best} / 3</b> · ${stats.plays} partie${stats.plays > 1 ? 's' : ''} jouée${stats.plays > 1 ? 's' : ''}</p>
        </div>
        <ol class="recap">
          ${Q.rounds.map((r) => {
            const item = D.quiz[r.idx];
            const ok = item.options[r.chosen].correct;
            const good = item.options.find((o) => o.correct);
            return `<li class="${ok ? 'is-ok' : 'is-ko'}">
              <span class="recap__mark">${icon(ok ? 'check' : 'x')}</span>
              <div><p class="recap__client">Client : «\u00a0${esc(item.client)}\u00a0»</p><p class="recap__good">${icon('arrowRight')} «\u00a0${esc(good.text)}\u00a0»</p></div>
            </li>`;
          }).join('')}
        </ol>
        <div class="results__actions">
          <button class="btn btn--outline" type="button" data-action="quiz-start">${icon('rotate')}<span>Rejouer avec 3 nouvelles situations</span></button>
          <button class="btn btn--primary" type="button" data-action="goto" data-step="5"><span>Voir la conclusion</span>${icon('arrowRight')}</button>
        </div>
      </article>`;
    }

    // Partie en cours
    const r = Q.rounds[Q.i];
    const item = D.quiz[r.idx];
    const answered = r.chosen !== null;
    const chosenOpt = answered ? item.options[r.chosen] : null;
    return `${head}
    <div class="quiz-bar anim">
      <div class="quiz-dots">
        ${Q.rounds.map((rr, j) => {
          const st = rr.chosen === null ? '' : (D.quiz[rr.idx].options[rr.chosen].correct ? 'is-ok' : 'is-ko');
          return `<span class="quiz-dot ${j === Q.i ? 'is-current' : ''} ${st}">${j + 1}</span>`;
        }).join('')}
        <span class="quiz-bar__label">Situation ${Q.i + 1} / ${Q.rounds.length}</span>
      </div>
      <span class="score-pill">${icon('trophy')} Score : <b>${quizScore()}</b> / ${Q.rounds.length}</span>
    </div>

    <article class="quiz anim" style="--d:60ms">
      ${bubble('client', item.client, 'bubble--lg')}
      <p class="quiz__ask">Quelle est la meilleure question à poser ?</p>
      <div class="options" role="group" aria-label="Propositions">
        ${r.order.map((optIdx, pos) => {
          const o = item.options[optIdx];
          let cls = '';
          if (answered) {
            if (o.correct) cls = 'is-correct';
            else if (optIdx === r.chosen) cls = 'is-wrong';
            else cls = 'is-dim';
          }
          return `<button type="button" class="option ${cls}" data-action="quiz-answer" data-opt="${optIdx}" ${answered ? 'disabled' : ''}>
            <span class="option__letter">${letters[pos]}</span>
            <span class="option__text">«\u00a0${esc(o.text)}\u00a0»</span>
            ${answered && o.correct ? `<span class="option__mark">${icon('check')}</span>` : ''}
            ${answered && optIdx === r.chosen && !o.correct ? `<span class="option__mark">${icon('x')}</span>` : ''}
          </button>`;
        }).join('')}
      </div>

      ${answered ? `
      <div class="feedback ${chosenOpt.correct ? 'is-ok' : 'is-ko'}">
        <h3>${icon(chosenOpt.correct ? 'check' : 'alert')} ${chosenOpt.correct ? 'Bonne réponse !' : 'Pas tout à fait…'}</h3>
        ${chosenOpt.correct ? '' : `<p class="feedback__why"><b>Votre choix :</b> ${esc(chosenOpt.why)}</p>`}
        <p><b>Meilleure question : ${letters[r.order.findIndex((j) => item.options[j].correct)]}.</b> ${esc(item.explanation)}</p>
        <button class="btn btn--primary" type="button" data-action="quiz-next">
          <span>${Q.i < Q.rounds.length - 1 ? 'Situation suivante' : 'Voir les résultats'}</span>${icon('arrowRight')}
        </button>
      </div>` : `<p class="quiz__tip">${icon('users')} Astuce animateur : touches <kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> pour répondre.</p>`}
    </article>`;
  }

  /* ==========================================================================
     ÉCRAN 6 – CONCLUSION
     ========================================================================== */
  function renderConclusion() {
    const best = S.quizStats.best;
    return `
    ${header('Étape 6 · Conclusion', 'Les 5 réflexes à adopter', 'À appliquer dès le prochain appel.')}
    <ol class="reflexes">
      ${D.reflexes.map((r, i) => `
        <li class="reflex anim" style="--d:${80 + i * 100}ms">
          <span class="reflex__num">${i + 1}</span>
          <span class="reflex__icon">${icon(r.icon)}</span>
          <p><span class="reflex__not">${esc(r.not)}</span>${r.sep ? esc(r.sep) : ' : '}<strong>${esc(r.do)}</strong></p>
        </li>`).join('')}
    </ol>

    <blockquote class="final anim" style="--d:620ms">
      <span class="final__icon">${icon('shieldCheck')}</span>
      <p>«\u00a0${esc(D.finalQuote)}\u00a0»</p>
    </blockquote>

    <p class="central anim" style="--d:740ms">${icon('sparkles')} ${esc(D.centralMessage)}</p>

    <div class="end-actions anim" style="--d:820ms">
      ${best !== null ? `<span class="score-pill">${icon('trophy')} Meilleur score de l'équipe : <b>${best}</b> / 3</span>` : ''}
      <button class="btn btn--primary btn--xl" type="button" data-action="restart">${icon('rotate')}<span>Recommencer le workshop</span></button>
    </div>`;
  }

  /* ==========================================================================
     NAVIGATION ET RENDU GLOBAL
     ========================================================================== */
  const renderers = [renderIntro, renderComparison, renderSituations, renderTransform, renderChallenge, renderConclusion];

  function render(opts) {
    const screen = $('#screen');
    screen.className = 'screen screen--' + D.steps[S.step].id;
    screen.innerHTML = renderers[S.step]();
    if (opts && opts.noAnim) screen.querySelectorAll('.anim').forEach((el) => el.classList.remove('anim'));
    renderChrome();
  }

  function renderChrome() {
    const n = D.steps.length;
    $('#stepper').innerHTML = D.steps.map((s, i) => `
      <li class="${i === S.step ? 'is-active' : ''} ${i < S.step ? 'is-past' : ''}">
        <button type="button" data-goto="${i}" ${i === S.step ? 'aria-current="step"' : ''} title="${esc(s.label)}">
          <span class="stepper__num">${i < S.step ? icon('check') : i + 1}</span><span class="stepper__label">${esc(s.label)}</span>
        </button>
      </li>`).join('');
    const pct = Math.round((S.step / (n - 1)) * 100);
    $('#progressBar').style.width = pct + '%';
    $('.progress').setAttribute('aria-valuenow', pct);
    $('#navStatus').innerHTML = `<b>${S.step + 1}</b> / ${n} · ${esc(D.steps[S.step].label)}`;
    $('#prevBtn').disabled = S.step === 0;
    const last = S.step === n - 1;
    $('#nextBtn').innerHTML = last
      ? `${icon('rotate')}<span class="btn__label">Recommencer</span>`
      : `<span class="btn__label">Suivant</span>${icon('arrowRight')}`;
    $('#notesText').textContent = D.steps[S.step].notes;
    $('#notes').hidden = !S.notes;
  }

  function go(step, focus) {
    step = Math.max(0, Math.min(D.steps.length - 1, step));
    if (step === S.step && $('#screen').innerHTML) return;
    S.step = step;
    lastAnimated = 'panel';
    stopTimer();
    voice.stop();
    if (location.hash !== '#' + D.steps[step].id) history.replaceState(null, '', '#' + D.steps[step].id);
    render();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (focus !== false) $('#screen').focus({ preventScroll: true });
  }

  function restart() {
    S.opened.clear();
    S.sit = freshSituations();
    S.sitActive = 0;
    S.trIndex = 0;
    S.quiz = { phase: 'intro', rounds: [], i: 0 };
    if (S.showAll) toggleAnswers();
    stopTimer();
    S.step = -1;
    go(0);
  }

  /* ---------- Révélations ---------- */
  function toggleReveal(key, btn) {
    if (S.opened.has(key)) S.opened.delete(key); else S.opened.add(key);
    const open = S.opened.has(key);
    if (open) {
      const play = document.querySelector(`.reveal[data-reveal-key="${key}"] .bubble--client [data-action="speak"]`);
      if (play) voice.speak(play.dataset.text, play); else voice.stop();
    } else voice.stop();
    document.querySelectorAll(`[data-reveal-key="${key}"]`).forEach((el) => {
      el.classList.toggle('is-open', open);
      el.classList.toggle('is-flipped', open);
    });
    document.querySelectorAll(`[data-action="reveal"][data-key="${key}"]`).forEach((b) => {
      b.setAttribute('aria-expanded', open);
      b.classList.toggle('is-active', open);
      const isFlip = b.closest('.flip');
      const ic = isFlip ? (open ? 'rotate' : 'repeat') : (open ? 'eyeOff' : 'eye');
      b.innerHTML = icon(ic) + `<span>${esc(open ? b.dataset.open : b.dataset.closed)}</span>`;
      if (isFlip) { b.classList.toggle('btn--ghost', open); b.classList.toggle('btn--dark', !open); }
    });
    // Le bandeau « À vous de jouer » des opportunités disparaît une fois révélé
    if (/-opps$/.test(key)) { lastAnimated = null; refreshPanel(); }
  }

  function refreshPanel() {
    const p = $('#sitPanel');
    if (p) p.innerHTML = renderSituationPanel();
    // met à jour les coches des onglets
    document.querySelectorAll('.sit-tab').forEach((t, i) => t.classList.toggle('is-done', situationDone(i)));
  }

  function toggleAnswers() {
    S.showAll = !S.showAll;
    document.body.classList.toggle('show-all', S.showAll);
    const b = $('#toggleAnswers');
    b.setAttribute('aria-pressed', S.showAll);
    b.innerHTML = icon(S.showAll ? 'eye' : 'eyeOff') + `<span class="tool__label">${S.showAll ? 'Réponses visibles' : 'Réponses masquées'}</span>`;
    lastAnimated = null;
    render({ noAnim: true });
  }

  function renderSoundButton() {
    const b = $('#toggleSound');
    b.setAttribute('aria-pressed', voice.on);
    b.innerHTML = icon(voice.on ? 'volume' : 'volumeOff') + `<span class="tool__label">${voice.on ? 'Voix activée' : 'Voix coupée'}</span>`;
  }
  function toggleSound() {
    voice.on = !voice.on;
    store.set(STORE_SOUND, voice.on);
    if (!voice.on) voice.stop();
    renderSoundButton();
  }

  function toggleNotes() {
    S.notes = !S.notes;
    $('#toggleNotes').setAttribute('aria-pressed', S.notes);
    $('#notes').hidden = !S.notes;
  }

  /* ---------- Plein écran ---------- */
  const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  function toggleFullscreen() {
    const el = document.documentElement;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (fsSupported) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
  function onFsChange() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('is-presenting', isFs);
    $('#toggleFullscreen').innerHTML = icon(isFs ? 'minimize' : 'maximize');
    $('#toggleFullscreen').setAttribute('aria-label', isFs ? 'Quitter le plein écran' : 'Plein écran');
  }

  /* ---------- Minuteur de réflexion ---------- */
  let timerId = null;
  function startTimer(secs) {
    stopTimer();
    const el = $('#timer');
    const ring = $('#timerRing');
    const C = 2 * Math.PI * 20;
    const end = Date.now() + secs * 1000;
    el.hidden = false;
    el.classList.remove('is-done');
    ring.style.strokeDasharray = C;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      const s = Math.ceil(left / 1000);
      $('#timerValue').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      ring.style.strokeDashoffset = C * (1 - left / (secs * 1000));
      if (left <= 0) {
        clearInterval(timerId); timerId = null;
        el.classList.add('is-done');
        $('#timerValue').textContent = 'Terminé';
      }
    };
    tick();
    timerId = setInterval(tick, 200);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    $('#timer').hidden = true;
  }

  /* ---------- Actions de l'écran ---------- */
  function handleAction(btn) {
    const a = btn.dataset.action;
    switch (a) {
      case 'goto': go(+btn.dataset.step); break;
      case 'reveal': toggleReveal(btn.dataset.key, btn); break;
      case 'timer': startTimer(+btn.dataset.secs); break;
      case 'speak': {
        const bub = btn.closest('.bubble');
        if (bub && bub.classList.contains('is-speaking')) voice.stop();
        else { const was = voice.on; voice.on = true; voice.speak(btn.dataset.text, btn); voice.on = was; }
        break;
      }

      case 'sit-select': {
        S.sitActive = +btn.dataset.index;
        lastAnimated = 'panel';
        const screen = $('#screen');
        screen.innerHTML = renderSituations();
        screen.querySelectorAll('.screen-head.anim, .sit-tabs.anim').forEach((el) => el.classList.remove('anim'));
        const tabs = $('.sit-tabs');
        if (tabs) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'sit-next-stage': {
        const st = S.sit[S.sitActive];
        const s = D.situations[S.sitActive];
        // Passer aux opportunités révèle d'abord les questions restantes
        if (st.stage === 2) st.questions = s.questions.length;
        st.stage = Math.min(STAGES.length - 1, st.stage + 1);
        lastAnimated = ['ctx', 'bad', 'questions', 'opps', 'end'][st.stage];
        refreshPanel();
        scrollToLast('.sit-block');
        break;
      }
      case 'sit-next-q': {
        const st = S.sit[S.sitActive];
        lastAnimated = 'q' + st.questions;
        st.questions = Math.min(D.situations[S.sitActive].questions.length, st.questions + 1);
        refreshPanel();
        scrollToLast('.qitem');
        break;
      }

      case 'tr-go': S.trIndex = +btn.dataset.index; render(); break;
      case 'tr-reveal': S.opened.add('tr-' + S.trIndex); render({ noAnim: true }); break;
      case 'tr-hide': S.opened.delete('tr-' + S.trIndex); render({ noAnim: true }); break;

      case 'quiz-start': newQuiz(); render(); break;
      case 'quiz-answer': answerQuiz(+btn.dataset.opt); break;
      case 'quiz-next':
        if (S.quiz.i < S.quiz.rounds.length - 1) { S.quiz.i++; render(); }
        else finishQuiz();
        break;

      case 'restart': restart(); break;
    }
  }

  function scrollToLast(sel) {
    const items = document.querySelectorAll('#sitPanel ' + sel);
    const el = items[items.length - 1];
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  function answerQuiz(optIdx) {
    const r = S.quiz.rounds[S.quiz.i];
    if (!r || r.chosen !== null) return;
    r.chosen = optIdx;
    render({ noAnim: true });
    const fb = $('.feedback');
    if (fb) { fb.classList.add('anim'); fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function finishQuiz() {
    const score = quizScore();
    const st = S.quizStats;
    st.plays += 1;
    st.last = score;
    st.best = st.best === null ? score : Math.max(st.best, score);
    store.set(STORE_QUIZ, st);
    S.quiz.phase = 'results';
    render();
  }

  /* ---------- Écouteurs ---------- */
  function bind() {
    $('#screen').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn && !btn.disabled) handleAction(btn);
    });
    $('#screen').addEventListener('input', (e) => {
      if (e.target.id === 'teamText') { S.team[S.trIndex] = e.target.value; store.set(STORE_TEAM, S.team); }
    });
    $('#stepper').addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (b) go(+b.dataset.goto);
    });
    $('#prevBtn').addEventListener('click', () => go(S.step - 1));
    $('#nextBtn').addEventListener('click', () => (S.step === D.steps.length - 1 ? restart() : go(S.step + 1)));
    $('#toggleAnswers').addEventListener('click', toggleAnswers);
    $('#toggleNotes').addEventListener('click', toggleNotes);
    $('#toggleSound').addEventListener('click', toggleSound);
    if (!voice.supported) $('#toggleSound').hidden = true;
    renderSoundButton();
    $('#toggleFullscreen').addEventListener('click', toggleFullscreen);
    $('#timerClose').addEventListener('click', stopTimer);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    if (!fsSupported) $('#toggleFullscreen').hidden = true;

    window.addEventListener('hashchange', () => {
      const i = D.steps.findIndex((s) => '#' + s.id === location.hash);
      if (i >= 0 && i !== S.step) go(i);
    });

    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); if (S.step < D.steps.length - 1) go(S.step + 1); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); go(S.step - 1); }
      else if (k === 'f' || k === 'F') toggleFullscreen();
      else if (k === 'h' || k === 'H') toggleAnswers();
      else if (k === 'n' || k === 'N') toggleNotes();
      else if (k === 's' || k === 'S') toggleSound();
      else if (k === 'Escape') stopTimer();
      else if (S.step === 4 && S.quiz.phase === 'play' && /^[abcABC]$/.test(k)) {
        const r = S.quiz.rounds[S.quiz.i];
        const pos = letters.indexOf(k.toUpperCase());
        if (r && r.chosen === null && r.order[pos] !== undefined) answerQuiz(r.order[pos]);
      }
    });
  }

  /* ---------- Démarrage ---------- */
  window.hydrateIcons();
  bind();
  const fromHash = D.steps.findIndex((s) => '#' + s.id === location.hash);
  S.step = -1;
  go(fromHash >= 0 ? fromHash : 0, false);
})();
