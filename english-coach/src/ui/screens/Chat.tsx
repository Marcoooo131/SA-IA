import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ChevronRight, MessageSquarePlus, Plus, RotateCcw, SendHorizontal, Sparkles, Trash2 } from 'lucide-react';
import { addExtraWord, currentDay, deleteChat, upsertChat, type ChatMessage, type ChatThread } from '../../core/state';
import { getState, setState, useAppState } from '../../core/store';
import { askTutor, SCENARIOS } from '../../core/tutor';
import { ApiError, errorMessage } from '../../core/api';
import { uid } from '../../core/util';
import { OfflineBanner, Page } from '../components/Page';
import { useOnline } from '../pwa';
import { navigate } from '../router';

function visibleThreads(chats: Record<string, ChatThread>) {
  return Object.values(chats)
    .filter((t) => t.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ChatList() {
  const state = useAppState();
  const online = useOnline();
  const threads = visibleThreads(state.chats);

  function start(scenario: string) {
    const meta = SCENARIOS.find((s) => s.id === scenario) ?? SCENARIOS[0];
    const now = Date.now();
    const thread: ChatThread = { id: uid('c_'), scenario: meta.id, title: meta.title, messages: [], createdAt: now, updatedAt: now };
    setState((s) => upsertChat(s, thread));
    navigate(`/chat/${thread.id}`);
  }

  return (
    <Page title="Conversation écrite" subtitle="Écris en anglais, ton professeur IA répond et corrige chaque message.">
      {!online && <p className="hint">La conversation nécessite Internet : tu pourras relire tes échanges, mais pas en écrire de nouveaux.</p>}
      <section className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquarePlus size={20} aria-hidden="true" /> Nouvelle conversation
        </h2>
        <p className="hint">Choisis une situation :</p>
        <div className="chips">
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => start(s.id)} disabled={!online}>
              {s.label}
            </button>
          ))}
        </div>
      </section>
      {threads.length > 0 && (
        <section className="card">
          <h2>Mes conversations</h2>
          <ul className="list">
            {threads.map((t) => {
              const last = t.messages[t.messages.length - 1];
              return (
                <li key={t.id}>
                  <a href={`#/chat/${t.id}`} className="grow" style={{ color: 'inherit', textDecoration: 'none', minHeight: 44 }}>
                    <strong>{t.title}</strong>
                    <br />
                    <span className="sub">{last ? last.text.slice(0, 70) : ''}</span>
                  </a>
                  <ChevronRight size={18} aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Page>
  );
}

export function ChatThreadScreen({ id }: { id: string }) {
  const state = useAppState();
  const online = useOnline();
  const thread = state.chats[id];
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);
  const day = currentDay(state);

  async function requestReply(messages: ChatMessage[]) {
    const current = getState().chats[id];
    if (!current) return;
    setPending(true);
    setError(null);
    try {
      const reply = await askTutor(current.scenario, day, messages);
      const latest = getState().chats[id] ?? current;
      const now = Date.now();
      const msgs = [...latest.messages];
      // Les corrections sont rattachées au message de l'utilisateur qu'elles concernent.
      const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
      if (lastUser >= 0 && !msgs[lastUser].corrections) msgs[lastUser] = { ...msgs[lastUser], corrections: reply.corrections };
      msgs.push({ id: uid('m_'), role: 'tutor', text: reply.reply, at: now, vocabulary: reply.vocabulary });
      setState((s) => upsertChat(s, { ...latest, messages: msgs, updatedAt: now }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  // Première ouverture : le professeur lance la conversation.
  useEffect(() => {
    if (!thread || started.current || thread.messages.length > 0 || !online) return;
    started.current = true;
    void requestReply([]);
  }, [thread, online]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length, pending, error]);

  if (!thread) {
    return (
      <div className="fullscreen">
        <div className="fs-body">
          <div className="inner">
            <p className="empty">Conversation introuvable.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/chat')}>
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lastIsUser = thread.messages.length > 0 && thread.messages[thread.messages.length - 1].role === 'user';

  function send() {
    const value = text.trim();
    if (!value || pending || !online || !thread) return;
    const now = Date.now();
    const message: ChatMessage = { id: uid('m_'), role: 'user', text: value.slice(0, 2000), at: now };
    const messages = [...thread.messages, message];
    // Le message est enregistré avant l'envoi : il n'est jamais perdu, même si le réseau coupe.
    setState((s) => upsertChat(s, { ...thread, messages, updatedAt: now }));
    setText('');
    void requestReply(messages);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function remove() {
    if (!window.confirm('Supprimer cette conversation ?')) return;
    setState((s) => deleteChat(s, id));
    navigate('/chat', { replace: true });
  }

  return (
    <div className="fullscreen" aria-label={`Conversation : ${thread.title}`}>
      <header className="fs-header">
        <button type="button" className="icon-btn" onClick={() => navigate('/chat')} aria-label="Retour aux conversations">
          <ArrowLeft size={24} aria-hidden="true" />
        </button>
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.title}</strong>
        <button type="button" className="icon-btn" onClick={remove} aria-label="Supprimer la conversation">
          <Trash2 size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="fs-body">
        <div className="inner">
          <OfflineBanner>Hors connexion : le professeur IA ne peut pas répondre sans Internet. Tes messages déjà échangés restent consultables.</OfflineBanner>
          <div className="messages" aria-live="polite">
            {thread.messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {pending && (
              <span className="typing-dots">
                <Sparkles size={14} aria-hidden="true" /> Le professeur écrit…
              </span>
            )}
            {error && (
              <div className="banner error" role="alert">
                <span style={{ flex: 1 }}>{error}</span>
                {online && (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void requestReply(thread.messages)}>
                    <RotateCcw size={16} aria-hidden="true" /> Réessayer
                  </button>
                )}
              </div>
            )}
            {!pending && !error && lastIsUser && online && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => void requestReply(thread.messages)}>
                Obtenir la réponse du professeur
              </button>
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>
      <footer className="fs-footer">
        <div className="inner">
          <div className="composer">
            <label htmlFor="chat-input" className="sr-only">
              Ton message en anglais
            </label>
            <textarea
              id="chat-input"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder={online ? 'Écris en anglais…' : 'Connexion requise'}
              disabled={!online}
              lang="en"
              autoCapitalize="sentences"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              maxLength={2000}
            />
            <button type="button" className="send-btn" onClick={send} disabled={!text.trim() || pending || !online} aria-label="Envoyer">
              <SendHorizontal size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  const state = useAppState();
  return (
    <>
      <div className={`msg ${message.role}`} lang="en">
        {message.text}
      </div>
      {message.role === 'user' && message.corrections && (
        message.corrections.length === 0 ? (
          <div className="corrections clean">Aucune faute, bravo !</div>
        ) : (
          <div className="corrections">
            <strong>Corrections</strong>
            <ul>
              {message.corrections.map((c, i) => (
                <li key={i}>
                  <del lang="en">{c.original}</del> → <ins lang="en">{c.corrected}</ins>
                  <br />
                  <span>{c.explanation}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
      {message.role === 'tutor' && message.vocabulary && message.vocabulary.length > 0 && (
        <div className="vocab" aria-label="Vocabulaire à retenir">
          {message.vocabulary.map((v) => {
            const added = Boolean(state.extraWords[`x:${v.en.toLowerCase().trim()}`]);
            return (
              <button
                key={v.en}
                type="button"
                className="chip"
                aria-pressed={added}
                disabled={added}
                onClick={() => setState((s) => addExtraWord(s, v.en, v.fr))}
                title={added ? 'Déjà dans tes révisions' : 'Ajouter à mes révisions'}
              >
                {added ? '✓' : <Plus size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} />} <span lang="en">{v.en}</span> = {v.fr}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
