-- Demande de rappel depuis la page ouverte par le SMS (filtrage des appels, niveau 1) : l'appelant dont la demande
-- n'est pas une prise de rendez-vous laisse son prénom et un motif court ; l'entreprise le voit dans l'historique.
ALTER TABLE missed_call_recovery
  ADD COLUMN callback_requested_at timestamptz,
  ADD COLUMN callback_name text CHECK (char_length(callback_name) <= 80),
  ADD COLUMN callback_note text CHECK (char_length(callback_note) <= 300),
  ADD COLUMN visitor_intent text CHECK (visitor_intent IN ('new', 'existing', 'callback'));
