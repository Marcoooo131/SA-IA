import { describe, expect, it } from 'vitest';
import { appointmentsToCsv } from './csv';
import { effectiveTimeZone, formatRange, localToIso } from './datetime';
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, localConflicts, overlaps } from './filters';
import { canDeleteAppointment, canEditAppointment, canViewAppointment } from './permissions';
import { buildHash, parseHash } from './router';
import type { Appointment, Category, Profile } from './types';
import { appointmentToForm, emptyForm, formToPayload, validateAppointmentForm, type AppointmentFormValues } from './validation';

const PARIS = 'Europe/Paris';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'me',
  email: 'me@ex.fr',
  full_name: 'Moi Même',
  role: 'collaborator',
  can_edit_all: false,
  is_active: true,
  color: '#E30613',
  phone: null,
  timezone: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  title: 'Visite Dupont',
  starts_at: '2030-01-10T08:00:00.000Z',
  ends_at: '2030-01-10T09:00:00.000Z',
  all_day: false,
  client_name: 'M. Dupont',
  responsible_id: 'bob',
  category_id: 'cat1',
  location: 'Lyon',
  description: null,
  notes: null,
  status: 'confirme',
  is_private: false,
  links: [],
  created_by: 'bob',
  updated_by: null,
  created_at: null,
  updated_at: null,
  masked: false,
  can_edit: false,
  can_delete: false,
  ...over,
});

const form = (over: Partial<AppointmentFormValues> = {}): AppointmentFormValues => ({
  title: 'Rendez-vous',
  date: '2030-03-30',
  endDate: '2030-03-30',
  startTime: '09:00',
  endTime: '10:30',
  allDay: false,
  clientName: '',
  responsibleId: '',
  categoryId: '',
  location: '',
  description: '',
  notes: '',
  status: 'a_confirmer',
  isPrivate: false,
  links: [],
  ...over,
});

describe('fuseaux horaires', () => {
  it("convertit l'heure locale en UTC, changement d'heure compris", () => {
    expect(localToIso('2030-01-10', '09:00', PARIS)).toBe('2030-01-10T08:00:00.000Z'); // hiver UTC+1
    expect(localToIso('2030-07-10', '09:00', PARIS)).toBe('2030-07-10T07:00:00.000Z'); // été UTC+2
    expect(localToIso('2030-07-10', '09:00', 'America/Montreal')).toBe('2030-07-10T13:00:00.000Z');
  });
  it('choisit le fuseau du profil, sinon celui de l’équipe', () => {
    expect(effectiveTimeZone('America/Montreal', PARIS)).toBe('America/Montreal');
    expect(effectiveTimeZone(null, PARIS)).toBe(PARIS);
    expect(effectiveTimeZone('Pas/UnFuseau', PARIS)).toBe(PARIS);
  });
  it('formate une plage en français', () => {
    expect(formatRange('2030-01-10T08:00:00Z', '2030-01-10T09:30:00Z', false, PARIS)).toBe('Jeudi 10 janvier · 09:00 – 10:30');
  });
});

describe('formulaire de rendez-vous', () => {
  it('valide un formulaire correct et produit des instants UTC', () => {
    const v = validateAppointmentForm(form({ title: '  Visite  ', clientName: '  ' }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const p = formToPayload(v.data, PARIS);
    expect(p.title).toBe('Visite');
    expect(p.client_name).toBeNull();
    // 30 mars 2030 : lendemain du passage à l'heure d'été (31 mars) → encore UTC+1
    expect(p.starts_at).toBe('2030-03-30T08:00:00.000Z');
    expect(p.ends_at).toBe('2030-03-30T09:30:00.000Z');
  });
  it('refuse un titre vide, une fin avant le début et un lien non web', () => {
    const v = validateAppointmentForm(form({ title: ' ', endTime: '08:00', links: [{ label: '', url: 'javascript:alert(1)' }] }));
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.title).toMatch(/obligatoire/);
    expect(v.errors.endTime).toMatch(/après/);
    expect(v.errors['links.0.url']).toMatch(/http/);
  });
  it('accepte un rendez-vous de nuit sur deux jours', () => {
    const v = validateAppointmentForm(form({ startTime: '22:00', endTime: '02:00', endDate: '2030-03-31' }));
    expect(v.ok).toBe(true);
  });
  it('gère la journée entière (fin exclusive au lendemain minuit local)', () => {
    const v = validateAppointmentForm(form({ allDay: true, startTime: '', endTime: '' }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const p = formToPayload(v.data, PARIS);
    expect(p.starts_at).toBe('2030-03-29T23:00:00.000Z');
    expect(p.ends_at).toBe('2030-03-30T23:00:00.000Z'); // 31 mars minuit (heure d'été seulement à 2 h)
    const back = appointmentToForm(appt({ ...p, all_day: true }), PARIS);
    expect(back.date).toBe('2030-03-30');
    expect(back.endDate).toBe('2030-03-30');
  });
  it('aller-retour rendez-vous → formulaire → rendez-vous', () => {
    const a = appt();
    const f = appointmentToForm(a, PARIS);
    expect(f).toMatchObject({ date: '2030-01-10', startTime: '09:00', endTime: '10:00', clientName: 'M. Dupont' });
    const p = formToPayload(f, PARIS);
    expect(p.starts_at).toBe(a.starts_at);
    expect(p.ends_at).toBe(a.ends_at);
  });
  it('pré-remplit un créneau sélectionné dans le calendrier', () => {
    const f = emptyForm({ zone: PARIS, start: '2030-01-10T14:00:00+01:00', end: '2030-01-10T15:30:00+01:00', defaultDurationMinutes: 60, responsibleId: 'me' });
    expect(f).toMatchObject({ date: '2030-01-10', startTime: '14:00', endTime: '15:30', responsibleId: 'me', status: 'a_confirmer' });
    const day = emptyForm({ zone: PARIS, start: '2030-01-10T09:00', defaultDurationMinutes: 45 });
    expect(day).toMatchObject({ startTime: '09:00', endTime: '09:45' });
  });
});

describe('chevauchements', () => {
  it('détecte les intervalles qui se recouvrent, pas ceux qui se touchent', () => {
    expect(overlaps('2030-01-10T08:00Z', '2030-01-10T09:00Z', '2030-01-10T08:30Z', '2030-01-10T10:00Z')).toBe(true);
    expect(overlaps('2030-01-10T08:00Z', '2030-01-10T09:00Z', '2030-01-10T09:00Z', '2030-01-10T10:00Z')).toBe(false);
  });
  it('ignore les annulés, les reportés, le rendez-vous lui-même et les autres collaborateurs', () => {
    const list = [appt(), appt({ id: 'a2', status: 'annule' }), appt({ id: 'a3', responsible_id: 'alice' }), appt({ id: 'a4', status: 'reporte' })];
    expect(localConflicts(list, 'bob', '2030-01-10T08:30:00Z', '2030-01-10T09:30:00Z').map((a) => a.id)).toEqual(['a1']);
    expect(localConflicts(list, 'bob', '2030-01-10T08:30:00Z', '2030-01-10T09:30:00Z', 'a1')).toEqual([]);
  });
});

describe('filtres et recherche', () => {
  const profiles = new Map([['bob', profile({ id: 'bob', full_name: 'Bob Martin' })]]);
  const categories = new Map<string, Category>([['cat1', { id: 'cat1', name: 'Intervention', color: '#000000', position: 1, is_active: true }]]);
  const list = [appt(), appt({ id: 'a2', title: 'Réunion', client_name: null, responsible_id: 'alice', category_id: null, status: 'annule' }), appt({ id: 'p', masked: true, title: 'Occupé' })];

  it('recherche sans tenir compte des accents ni de la casse, y compris par responsable et catégorie', () => {
    expect(applyFilters(list, { ...DEFAULT_FILTERS, query: 'reunion' }, profiles, categories).map((a) => a.id)).toEqual(['a2']);
    expect(applyFilters(list, { ...DEFAULT_FILTERS, query: 'martin interv' }, profiles, categories).map((a) => a.id)).toEqual(['a1']);
  });
  it('filtre par collaborateur, catégorie, statut, et masque les annulés', () => {
    expect(applyFilters(list, { ...DEFAULT_FILTERS, responsibleId: 'alice' }, profiles, categories)).toHaveLength(1);
    expect(applyFilters(list, { ...DEFAULT_FILTERS, categoryId: 'cat1' }, profiles, categories).map((a) => a.id)).toEqual(['a1', 'p']);
    expect(applyFilters(list, { ...DEFAULT_FILTERS, status: 'annule' }, profiles, categories).map((a) => a.id)).toEqual(['a2']);
    expect(applyFilters(list, { ...DEFAULT_FILTERS, hideCancelled: true }, profiles, categories).map((a) => a.id)).toEqual(['a1', 'p']);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, status: 'annule', hideCancelled: true })).toBe(2);
  });
  it("un créneau masqué n'apparaît jamais dans une recherche textuelle", () => {
    expect(applyFilters(list, { ...DEFAULT_FILTERS, query: 'occupé' }, profiles, categories)).toHaveLength(0);
  });
});

describe('autorisations (reflet des règles de la base)', () => {
  const admin = profile({ id: 'admin', role: 'admin' });
  const bob = profile({ id: 'bob' });
  const carol = profile({ id: 'carol', can_edit_all: true });
  const alicePrivate = appt({ created_by: 'alice', responsible_id: 'alice', is_private: true });
  const alicePublic = appt({ created_by: 'alice', responsible_id: 'alice' });

  it('confidentialité', () => {
    expect(canViewAppointment(alicePrivate, bob)).toBe(false);
    expect(canViewAppointment(alicePrivate, admin)).toBe(true);
    expect(canViewAppointment(alicePublic, profile({ id: 'bob', is_active: false }))).toBe(false);
  });
  it('modification', () => {
    expect(canEditAppointment(alicePublic, bob)).toBe(false);
    expect(canEditAppointment(alicePublic, carol)).toBe(true);
    expect(canEditAppointment(alicePrivate, carol)).toBe(false);
    expect(canEditAppointment(appt({ responsible_id: 'bob', created_by: 'x' }), bob)).toBe(true);
  });
  it('suppression', () => {
    expect(canDeleteAppointment(alicePublic, admin, null)).toBe(true);
    expect(canDeleteAppointment(appt({ created_by: 'bob' }), bob, { collaborators_can_delete: false })).toBe(false);
    expect(canDeleteAppointment(appt({ created_by: 'bob' }), bob, { collaborators_can_delete: true })).toBe(true);
  });
});

describe('export CSV', () => {
  it('produit un CSV Excel (BOM, « ; »), neutralise les formules et exclut les créneaux masqués', () => {
    const csv = appointmentsToCsv(
      [appt({ title: '=HYPERLINK("x")', description: 'ligne 1\nligne 2' }), appt({ id: 'p', masked: true })],
      new Map([['bob', profile({ id: 'bob', full_name: 'Bob' })]]),
      new Map(),
      PARIS,
    );
    expect(csv.startsWith('﻿Date;Début;Fin')).toBe(true);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain('10/01/2030;09:00;10:00');
    expect(lines[1]).toContain('"ligne 1\nligne 2"');
  });
});

describe('navigation', () => {
  it('lit et écrit les routes, ignore les fragments d’authentification', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(parseHash(`#/agenda?rdv=${id}`)).toEqual({ page: 'agenda', appointmentId: id });
    expect(parseHash('#access_token=abc&type=invite')).toEqual({ page: 'dashboard', appointmentId: null });
    expect(parseHash('#/agenda?rdv=<script>')).toEqual({ page: 'agenda', appointmentId: null });
    expect(buildHash({ page: 'profile', appointmentId: null })).toBe('#/profil');
  });
});

describe('configuration Supabase', () => {
  it('nettoie les valeurs mal collées', async () => {
    const { normalizeSupabaseUrl, normalizeKey, configProblem } = await import('./config');
    expect(normalizeSupabaseUrl(' "https://abcdefghijklmnop.supabase.co/" ')).toBe('https://abcdefghijklmnop.supabase.co');
    expect(normalizeSupabaseUrl('abcdefghijklmnopqrst')).toBe('https://abcdefghijklmnopqrst.supabase.co');
    expect(normalizeSupabaseUrl('abcdefghijklmnop.supabase.co')).toBe('https://abcdefghijklmnop.supabase.co');
    expect(normalizeSupabaseUrl('https://abcdefghijklmnop.supabase.co/rest/v1/')).toBe('https://abcdefghijklmnop.supabase.co');
    expect(normalizeSupabaseUrl('https://supabase.com/dashboard/project/abcdefghijklmnopqrst/settings/api')).toBe('https://abcdefghijklmnopqrst.supabase.co');
    expect(normalizeKey(' "sb_publishable_abc"\n')).toBe('sb_publishable_abc');
    expect(configProblem('https://x.supabase.co', 'cle')).toBeNull();
    expect(configProblem('', 'cle')).toMatch(/AGENDA_SUPABASE_URL/);
    expect(configProblem('https://x y.supabase.co', 'cle')).toMatch(/pas une URL valide/);
    expect(configProblem('https://x.supabase.co', 'sb_secret_abc')).toMatch(/SECRÈTE/);
  });
});
