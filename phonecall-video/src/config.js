// Central configuration of the video: format, palette, fonts, texts and THE timeline.
// Every animation (scene.js) and every sound (audio.js) reads its times from here:
// change a time once, image and sound stay in sync.

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 60,
  duration: 30, // seconds
  sampleRate: 48000,
};

// TikTok safe zone (1080 × 1920): nothing essential under the top bar, the right-hand buttons or the
// caption area at the bottom.
export const SAFE = { left: 70, right: 930, top: 210, bottom: 1450 };

export const COLORS = {
  black: "#0B0B0D",
  white: "#FFFFFF",
  red: "#E30613",
  redDeep: "#8E0410",
  metal: "#2A2B30",
  metalLight: "#3A3C43",
  grey: "#8C8F98",
  greyLight: "#C9CBD1",
  panel: "#141418",
  panelLine: "#2C2D33",
};

export const FONT = {
  family: "Inter",
  display: "'Inter Display', Inter, sans-serif", // headlines
  ui: "Inter, sans-serif", // interface
};

// Texts. *Words between asterisks* are drawn in red.
export const TEXT = {
  s1a: "APRÈS CHAQUE *APPEL…*",
  s1b: "ENCORE DES *NOTES*",
  s2: "L'IA PREND\n*LE RELAIS*",
  s3: "TRANSCRIPTION\n*EN DIRECT*",
  s4: "UN CLIC.\n*UNE NOTE.*",
  s5: "COMPTE RENDU\n*AUTOMATIQUE*",
  s6a: "MOINS DE *SAISIE*",
  s6b: "PLUS DE\n*TEMPS UTILE*",
  logo: "PHONE CALL *AI*",
  sign1: "VOUS GÉREZ L'APPEL.",
  sign2: "L'IA RÉDIGE *LA NOTE.*",
  start: "DÉMARRER",
  end: "FIN",
  copy: "COPIER LA NOTE",
  copied: "NOTE COPIÉE",
  fictive: "Conversation fictive",
  fictiveNote: "Exemple fictif",
};

// Fictitious conversation (scene 3). speaker: remote (interlocuteur) | advisor (conseiller).
export const CONVERSATION = [
  { speaker: "remote", text: "Bonjour, je vous appelle pour mon déménagement.", start: 7.55, end: 9.05 },
  { speaker: "advisor", text: "Votre déménagement est prévu le 24 octobre.", start: 9.3, end: 10.75 },
  { speaker: "advisor", text: "Nous allons vérifier votre dossier et les prochaines étapes.", start: 11.0, end: 12.75 },
];

// Fields that appear during the generation (scene 4)
export const GENERATED_FIELDS = [
  { label: "Motif de l'appel", value: "Déménagement", at: 15.0 },
  { label: "Situation", value: "Déménagement prévu le 24 octobre", at: 15.55 },
  { label: "Réponse apportée", value: "Vérification du dossier", at: 16.1 },
  { label: "Actions à suivre", value: "Vérifier le dossier — conseiller", at: 16.65 },
];

// Phone Call note (scene 5) — fictitious example
export const NOTE = {
  header: "MOVERS",
  absent: "Aucune information notifiée",
  rows: [
    { label: "Interlocuteur", value: null },
    { label: "Nom", value: null },
    { label: "Numéro de téléphone", value: null },
    { label: "Agent", value: null },
    { label: "Raison de l'appel", value: "Demande concernant un déménagement" },
    { label: "Situation", value: "Déménagement prévu le 24 octobre" },
    { label: "Réponse apportée", value: "Vérification du dossier et explication des prochaines étapes" },
    { label: "Date de rendez-vous", value: null },
    { label: "Offre commerciale", value: null },
    { label: "Informations complémentaires", value: null },
  ],
};

// THE timeline (seconds). Scenes and cues used by the image AND the sound.
export const SCENES = [
  { id: "problem", start: 0, end: 4 },
  { id: "solution", start: 4, end: 7 },
  { id: "transcription", start: 7, end: 13 },
  { id: "generation", start: 13, end: 18 },
  { id: "note", start: 18, end: 24 },
  { id: "result", start: 24, end: 27 },
  { id: "signature", start: 27, end: 30 },
];

export const CUES = {
  pickup: 0.06,
  crmSlam: 0.45,
  s1aIn: 0.7,
  s1bIn: 2.15,
  typingBursts: [[0.9, 1.6], [1.95, 2.5], [2.8, 3.55]],
  deleteBursts: [[1.6, 1.85], [2.5, 2.7], [3.55, 3.8]],
  cutToSilence: 4.0,
  redPulse: 4.18,
  startAppear: 4.35,
  startClick: 5.05,
  waveOn: 5.15,
  s2TextIn: 5.35,
  beatStart: 5.5, // music groove (120 BPM)
  bpm: 120,
  splitIn: 7.0,
  endClick: 13.35,
  waveOff: [13.4, 14.2],
  transform: [14.25, 15.0], // transcription → structured note
  fieldPops: GENERATED_FIELDS.map((f) => f.at),
  zoomToNote: 18.0,
  noteTyping: [18.35, 21.6],
  copyClick: 22.35,
  copied: 22.55,
  resultIn: 24.0,
  validate: 24.35,
  s6bIn: 25.6,
  riserToEnd: [26.2, 27.0],
  signatureCut: 27.0,
  lineDraw: [27.05, 27.9],
  logoImpact: 27.6,
  sign1In: 28.15,
  sign2In: 28.55,
};
