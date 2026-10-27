import {
  CalendarClock,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  Send,
  Tag,
  Trash2,
  Upload,
  User,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import {
  addComment,
  attachmentUrl,
  deleteAppointment,
  deleteAttachment,
  deleteComment,
  fetchAppointment,
  fetchAttachments,
  fetchComments,
  fetchHistory,
  updateAppointment,
  uploadAttachment,
} from '../data/api';
import { formatDate, formatRange, relativeTime } from '../lib/datetime';
import { canDeleteAppointment, canEditAppointment, isAdmin } from '../lib/permissions';
import { appointmentLink } from '../lib/router';
import { FIELD_LABELS, STATUS_META, statusLabel } from '../lib/status';
import { supabase } from '../lib/supabase';
import { STATUSES, type AppointmentRow, type AppointmentStatus, type Attachment, type Comment, type HistoryEntry } from '../lib/types';
import { Avatar, ConfirmDialog, EmptyState, Modal, PrivateBadge, Spinner, StatusBadge, displayName } from './ui';

type Tab = 'infos' | 'comments' | 'notes' | 'files' | 'history';

export function AppointmentDetail({
  appointmentId,
  onClose,
  onEdit,
}: {
  appointmentId: string | null;
  onClose: () => void;
  onEdit: (a: AppointmentRow) => void;
}) {
  const { profile } = useAuth();
  const { profileMap, categoryMap, settings, zone, appointmentsVersion, bumpAppointments } = useTeam();
  const toast = useToast();
  const [appt, setAppt] = useState<AppointmentRow | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [tab, setTab] = useState<Tab>('infos');
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadAppt = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const row = await fetchAppointment(appointmentId);
      setAppt(row);
      setState(row ? 'ready' : 'missing');
    } catch (e) {
      toast.error(e);
      setState('missing');
    }
  }, [appointmentId, toast]);

  const loadRelated = useCallback(async () => {
    if (!appointmentId) return;
    const [c, f, h] = await Promise.allSettled([fetchComments(appointmentId), fetchAttachments(appointmentId), fetchHistory(appointmentId)]);
    if (c.status === 'fulfilled') setComments(c.value);
    if (f.status === 'fulfilled') setFiles(f.value);
    if (h.status === 'fulfilled') setHistory(h.value);
  }, [appointmentId]);

  useEffect(() => {
    setState('loading');
    setTab('infos');
    setAppt(null);
    setComments([]);
    setFiles([]);
    setHistory([]);
  }, [appointmentId]);

  // Rechargé aussi quand un collègue modifie le rendez-vous
  useEffect(() => {
    void loadAppt();
    void loadRelated();
  }, [loadAppt, loadRelated, appointmentsVersion]);

  // Commentaires, fichiers et historique en temps réel
  useEffect(() => {
    if (!appointmentId) return;
    const filter = `appointment_id=eq.${appointmentId}`;
    const channel = supabase
      .channel(`appt-${appointmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_comments', filter }, () => void loadRelated())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_attachments', filter }, () => void loadRelated())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointment_history', filter }, () => void loadRelated())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appointmentId, loadRelated]);

  const canEdit = !!appt && canEditAppointment(appt, profile);
  const canDelete = !!appt && canDeleteAppointment(appt, profile, settings);

  const changeStatus = async (status: AppointmentStatus) => {
    if (!appt || status === appt.status) return;
    setBusy(true);
    try {
      setAppt(await updateAppointment(appt.id, { status }));
      bumpAppointments();
      toast.success(`Statut : ${statusLabel(status)}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!appt) return;
    setBusy(true);
    try {
      await deleteAppointment(appt.id);
      toast.success('Rendez-vous supprimé');
      bumpAppointments();
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!appt) return;
    try {
      await navigator.clipboard.writeText(appointmentLink(appt.id));
      toast.success('Lien copié');
    } catch {
      toast.info(appointmentLink(appt.id));
    }
  };

  const category = appt?.category_id ? categoryMap.get(appt.category_id) : undefined;
  const postNotes = comments.filter((c) => c.kind === 'post_note');
  const plainComments = comments.filter((c) => c.kind === 'comment');

  const tabs: { id: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { id: 'infos', label: 'Infos', icon: <FileText className="h-4 w-4" /> },
    { id: 'comments', label: 'Commentaires', icon: <MessageSquare className="h-4 w-4" />, count: plainComments.length },
    { id: 'notes', label: 'Comptes rendus', icon: <ClipboardList className="h-4 w-4" />, count: postNotes.length },
    { id: 'files', label: 'Fichiers', icon: <Paperclip className="h-4 w-4" />, count: files.length },
    { id: 'history', label: 'Historique', icon: <History className="h-4 w-4" /> },
  ];

  return (
    <>
      <Modal
        open={!!appointmentId}
        onClose={onClose}
        variant="drawer"
        title={
          appt ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {category && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: category.color }}>
                    {category.name}
                  </span>
                )}
                <StatusBadge status={appt.status} />
                {appt.is_private && <PrivateBadge />}
              </div>
              <h2 className={`text-xl leading-tight ${appt.status === 'annule' ? 'line-through decoration-brand/60' : ''}`}>{appt.title}</h2>
              <p className="text-sm font-medium text-neutral-600">{formatRange(appt.starts_at, appt.ends_at, appt.all_day, zone)}</p>
            </div>
          ) : (
            'Rendez-vous'
          )
        }
        footer={
          appt && (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <button className="btn-primary flex-1 sm:flex-none" onClick={() => onEdit(appt)}>
                  <Pencil className="h-4 w-4" /> Modifier
                </button>
              )}
              <button className="btn-ghost" onClick={copyLink} title="Copier le lien">
                <Copy className="h-4 w-4" /> <span className="hidden sm:inline">Copier le lien</span>
              </button>
              {canDelete && (
                <button className="btn-ghost ml-auto text-brand hover:border-brand" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Supprimer</span>
                </button>
              )}
            </div>
          )
        }
      >
        {state === 'loading' && (
          <div className="flex justify-center py-16">
            <Spinner className="h-8 w-8" />
          </div>
        )}
        {state === 'missing' && (
          <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Rendez-vous indisponible">
            Il a été supprimé, ou il est confidentiel et vous n'avez pas accès à son contenu.
          </EmptyState>
        )}
        {state === 'ready' && appt && (
          <div className="space-y-4">
            {canEdit && (
              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Changer le statut</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={busy}
                      onClick={() => changeStatus(s)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        appt.status === s ? 'border-ink bg-ink text-white' : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_META[s].color }} />
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 md:-mx-6 md:px-6" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                    tab === t.id ? 'border-brand text-ink' : 'border-transparent text-neutral-500 hover:text-ink'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {!!t.count && <span className="rounded-full bg-neutral-200 px-1.5 text-xs">{t.count}</span>}
                </button>
              ))}
            </div>

            {tab === 'infos' && renderInfo(appt)}
            {tab === 'comments' && (
              <CommentsTab appointmentId={appt.id} comments={plainComments} kind="comment" onChanged={loadRelated} />
            )}
            {tab === 'notes' && <CommentsTab appointmentId={appt.id} comments={postNotes} kind="post_note" onChanged={loadRelated} />}
            {tab === 'files' && <FilesTab appointmentId={appt.id} files={files} onChanged={loadRelated} />}
            {tab === 'history' && renderHistory(history)}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce rendez-vous ?"
        message={
          <>
            « {appt?.title} » sera supprimé pour toute l'équipe, avec ses commentaires et pièces jointes. L'historique conserve une trace de la
            suppression.
          </>
        }
        confirmLabel="Supprimer"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );

  function renderInfo(appt: AppointmentRow) {
    const responsible = appt.responsible_id ? profileMap.get(appt.responsible_id) : null;
    const creator = appt.created_by ? profileMap.get(appt.created_by) : null;
    const editor = appt.updated_by ? profileMap.get(appt.updated_by) : null;
    return (
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <InfoRow icon={<User className="h-4 w-4" />} label="Client / participant">
            {appt.client_name || <span className="text-neutral-400">Non renseigné</span>}
          </InfoRow>
          <InfoRow icon={<UserCheck className="h-4 w-4" />} label="Responsable">
            {responsible ? (
              <span className="inline-flex items-center gap-2">
                <Avatar profile={responsible} size="sm" />
                {displayName(responsible)}
              </span>
            ) : (
              <span className="text-neutral-400">Non attribué</span>
            )}
          </InfoRow>
          <InfoRow icon={<MapPin className="h-4 w-4" />} label="Lieu">
            {appt.location ? (
              <a
                className="text-ink underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.location)}`}
                target="_blank"
                rel="noreferrer"
              >
                {appt.location}
              </a>
            ) : (
              <span className="text-neutral-400">Non renseigné</span>
            )}
          </InfoRow>
          <InfoRow icon={<Tag className="h-4 w-4" />} label="Catégorie">
            {category?.name ?? <span className="text-neutral-400">Aucune</span>}
          </InfoRow>
        </dl>

        {appt.description && (
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Description</h3>
            <p className="text-sm whitespace-pre-wrap text-neutral-800">{appt.description}</p>
          </section>
        )}
        {appt.notes && (
          <section className="rounded-xl bg-neutral-50 p-3">
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Notes complémentaires</h3>
            <p className="text-sm whitespace-pre-wrap text-neutral-800">{appt.notes}</p>
          </section>
        )}
        {appt.links.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Liens</h3>
            <ul className="space-y-1">
              {appt.links.map((l, i) => (
                <li key={i}>
                  <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                    <Link2 className="h-4 w-4" />
                    {l.label || l.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="rounded-xl border border-neutral-200 p-3 text-xs text-neutral-500">
          <p>
            Créé par <strong className="text-neutral-700">{displayName(creator, 'un ancien membre')}</strong>
            {appt.created_at && <> le {formatDate(appt.created_at, zone, "d LLL yyyy 'à' HH:mm")}</>}
          </p>
          {appt.updated_at && (
            <p className="mt-0.5">
              Dernière modification {relativeTime(appt.updated_at)} ({formatDate(appt.updated_at, zone, "d LLL yyyy 'à' HH:mm")})
              {editor && (
                <>
                  {' '}
                  par <strong className="text-neutral-700">{displayName(editor)}</strong>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderHistory(entries: HistoryEntry[]) {
    if (!entries.length) return <EmptyState icon={<History className="h-6 w-6" />} title="Aucun historique" />;
    return (
      <ol className="relative space-y-4 border-l-2 border-neutral-200 pl-5">
        {entries.map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute top-1 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-brand ring-2 ring-neutral-200" />
            <p className="text-sm">
              <strong>{displayName(h.actor_id ? profileMap.get(h.actor_id) : null, 'Système')}</strong>{' '}
              {historyVerb(h)}
            </p>
            <p className="text-xs text-neutral-500">
              {formatDate(h.created_at, zone, "d LLL yyyy 'à' HH:mm")} · {relativeTime(h.created_at)}
            </p>
            {h.action === 'updated' && (
              <ul className="mt-1.5 space-y-1 rounded-lg bg-neutral-50 p-2 text-xs">
                {Object.entries(h.changes).map(([field, change]) => {
                  const c = change as { old: unknown; new: unknown };
                  return (
                    <li key={field}>
                      <span className="font-semibold text-neutral-700">{FIELD_LABELS[field] ?? field} :</span>{' '}
                      <span className="text-neutral-500 line-through">{formatValue(field, c.old)}</span> →{' '}
                      <span className="text-ink">{formatValue(field, c.new)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    );
  }

  function formatValue(field: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '∅';
    if (field === 'starts_at' || field === 'ends_at') return formatDate(String(v), zone, 'dd/LL/yyyy HH:mm');
    if (field === 'responsible_id') return displayName(profileMap.get(String(v)), 'inconnu');
    if (field === 'category_id') return categoryMap.get(String(v))?.name ?? 'supprimée';
    if (field === 'status') return statusLabel(v as AppointmentStatus);
    if (typeof v === 'boolean') return v ? 'oui' : 'non';
    if (Array.isArray(v)) return `${v.length} lien(s)`;
    const s = String(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
}

function historyVerb(h: HistoryEntry): string {
  switch (h.action) {
    case 'created':
      return 'a créé le rendez-vous';
    case 'updated':
      return 'a modifié :';
    case 'deleted':
      return 'a supprimé le rendez-vous';
    case 'comment':
      return (h.changes as { kind?: string }).kind === 'post_note' ? 'a ajouté un compte rendu' : 'a commenté';
    case 'attachment': {
      const c = h.changes as { file_name?: string; operation?: string };
      return `${c.operation === 'delete' ? 'a retiré' : 'a joint'} le fichier « ${c.file_name ?? ''} »`;
    }
  }
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-neutral-200 p-3">
      <span className="mt-0.5 text-brand">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-neutral-500">{label}</dt>
        <dd className="text-sm font-medium break-words text-ink">{children}</dd>
      </div>
    </div>
  );
}

function CommentsTab({
  appointmentId,
  comments,
  kind,
  onChanged,
}: {
  appointmentId: string;
  comments: Comment[];
  kind: Comment['kind'];
  onChanged: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const { profileMap, zone } = useTeam();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await addComment(appointmentId, body, kind);
      setBody('');
      await onChanged();
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteComment(id);
      await onChanged();
    } catch (e) {
      toast.error(e);
    }
  };

  const isNote = kind === 'post_note';
  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <EmptyState icon={isNote ? <ClipboardList className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />} title={isNote ? 'Aucun compte rendu' : 'Aucun commentaire'}>
          {isNote ? 'Ajoutez le résultat du rendez-vous, les décisions et la suite à donner.' : 'Échangez avec l’équipe à propos de ce rendez-vous.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const author = c.author_id ? profileMap.get(c.author_id) : null;
            const mine = c.author_id === profile?.id;
            return (
              <li key={c.id} className={`flex gap-3 ${isNote ? 'rounded-xl border border-neutral-200 p-3' : ''}`}>
                <Avatar profile={author} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{displayName(author, 'Ancien membre')}</span>
                    <span className="text-xs text-neutral-500" title={formatDate(c.created_at, zone, "d LLL yyyy 'à' HH:mm")}>
                      {relativeTime(c.created_at)}
                    </span>
                    {(mine || isAdmin(profile)) && (
                      <button onClick={() => remove(c.id)} className="ml-auto text-neutral-400 hover:text-brand" aria-label="Supprimer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className={`mt-0.5 text-sm whitespace-pre-wrap text-neutral-800 ${isNote ? '' : 'rounded-xl rounded-tl-none bg-neutral-100 px-3 py-2'}`}>{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="sticky bottom-0 -mx-1 bg-white pt-1">
        <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-white p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={isNote ? 3 : 1}
            maxLength={5000}
            placeholder={isNote ? 'Compte rendu du rendez-vous…' : 'Écrire un commentaire…'}
            className="max-h-40 min-h-10 flex-1 resize-y border-0 bg-transparent px-1 py-1.5 text-base outline-none md:text-sm"
          />
          <button className="btn-primary h-10 px-3" onClick={send} disabled={sending || !body.trim()} aria-label="Envoyer">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilesTab({ appointmentId, files, onChanged }: { appointmentId: string; files: Attachment[]; onChanged: () => Promise<void> }) {
  const { profile } = useAuth();
  const { profileMap } = useTeam();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      try {
        await uploadAttachment(appointmentId, f);
      } catch (e) {
        toast.error(`« ${f.name} » : ${(e as Error).message}`);
      }
    }
    setUploading(false);
    await onChanged();
  };

  const open = async (f: Attachment) => {
    try {
      window.open(await attachmentUrl(f.storage_path), '_blank', 'noopener');
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (f: Attachment) => {
    try {
      await deleteAttachment(f);
      await onChanged();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <EmptyState icon={<Paperclip className="h-6 w-6" />} title="Aucune pièce jointe">
          Devis, plans, photos… (10 Mo maximum par fichier)
        </EmptyState>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <Paperclip className="h-5 w-5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.file_name}</p>
                <p className="text-xs text-neutral-500">
                  {Math.ceil(f.size_bytes / 1024)} Ko · {displayName(f.uploaded_by ? profileMap.get(f.uploaded_by) : null)} · {relativeTime(f.created_at)}
                </p>
              </div>
              <button className="btn-icon" onClick={() => open(f)} aria-label="Ouvrir">
                <Download className="h-4 w-4" />
              </button>
              {(f.uploaded_by === profile?.id || isAdmin(profile)) && (
                <button className="btn-icon hover:text-brand" onClick={() => remove(f)} aria-label="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      <button className="btn-ghost w-full" onClick={() => input.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Ajouter des fichiers
      </button>
    </div>
  );
}
