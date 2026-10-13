import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard, DossiersView } from './Dashboard';
import { useApp, setRepository } from '@/state/store';
import { createLocalRepository } from '@/persistence/storage';

describe('tableau de bord et création de dossier', () => {
  beforeEach(() => {
    localStorage.clear();
    setRepository(createLocalRepository(localStorage));
    useApp.getState().resetDemo();
  });

  it('propose les trois façons de créer le plan, questionnaire recommandé', () => {
    render(<Dashboard />);
    expect(screen.getByTestId('start-questionnaire')).toHaveTextContent('Recommandé');
    expect(screen.getByTestId('start-dessin')).toHaveTextContent('Dessiner mon logement en 2D');
    expect(screen.getByTestId('start-import')).toHaveTextContent('Importer un plan ou une photo');
  });

  it('liste les dossiers de démonstration avec montants estimés', () => {
    render(<Dashboard />);
    const row = screen.getByTestId('dossier-row-MOV-DEMO-0001');
    expect(within(row).getByText('1 893 €')).toBeInTheDocument();
    expect(within(row).getByText('55,90 €/mois')).toBeInTheDocument();
  });

  it('recherche par référence (vue Dossiers)', async () => {
    render(<DossiersView />);
    await userEvent.type(screen.getByLabelText('Rechercher par référence'), '0002');
    expect(screen.queryByTestId('dossier-row-MOV-DEMO-0001')).not.toBeInTheDocument();
    expect(screen.getByTestId('dossier-row-MOV-DEMO-0002')).toBeInTheDocument();
  });

  it('crée un dossier depuis le formulaire et refuse un formulaire incomplet', async () => {
    render(<Dashboard />);
    await userEvent.click(screen.getByTestId('start-questionnaire'));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Créer et répondre au questionnaire/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/client est obligatoire/);
    await userEvent.type(dialog.querySelector('input[name="clientName"]')!, 'Client test 042');
    await userEvent.type(dialog.querySelector('input[name="address"]')!, '3 allée Fictive');
    await userEvent.type(dialog.querySelector('input[name="surface"]')!, '95');
    await userEvent.click(within(dialog).getByRole('button', { name: /Créer et répondre au questionnaire/ }));
    const s = useApp.getState();
    const created = s.dossiers.find((d) => d.info.clientName === 'Client test 042')!;
    expect(created).toBeDefined();
    expect(created.info.surface).toBe(95);
    expect(s.view).toBe('workspace');
    expect(s.tab).toBe('modele');
    expect(s.activeDossierId).toBe(created.id);
  });

  it('affiche un état vide élégant sans dossier', () => {
    useApp.setState({ dossiers: [] });
    render(<Dashboard />);
    expect(screen.getByText('Aucun dossier pour le moment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Créer mon premier audit/ })).toBeInTheDocument();
  });
});
