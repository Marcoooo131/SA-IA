import { Component, type ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EditorProvider } from './context/EditorContext';
import { TeamProvider } from './context/TeamContext';
import { ToastProvider } from './context/ToastContext';
import { AdminPage } from './pages/AdminPage';
import { AgendaPage } from './pages/AgendaPage';
import { LoginPage, MessagePage, SetPasswordPage, SetupPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { useRoute } from './lib/router';
import { isConfigured } from './lib/supabase';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <MessagePage
          title="Une erreur inattendue est survenue"
          action={
            <button className="btn-primary w-full" onClick={() => window.location.reload()}>
              Recharger la page
            </button>
          }
        >
          <p>Vos données sont enregistrées sur le serveur : rechargez la page pour continuer.</p>
          <p className="rounded bg-neutral-100 p-2 font-mono text-xs break-words">{this.state.error.message}</p>
        </MessagePage>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const { session, profile, loading, profileError, mustSetPassword, signOut } = useAuth();
  const route = useRoute();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-ink">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!session) return <LoginPage />;
  if (mustSetPassword) return <SetPasswordPage />;
  if (!profile) {
    return (
      <MessagePage
        title={profileError ? 'Profil indisponible' : 'Chargement du profil…'}
        action={
          <button className="btn-ghost w-full" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        }
      >
        {profileError ? <p>{profileError}</p> : <Spinner />}
      </MessagePage>
    );
  }
  if (!profile.is_active) {
    return (
      <MessagePage
        title="Compte désactivé"
        action={
          <button className="btn-primary w-full" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        }
      >
        <p>Votre accès à l'agenda a été suspendu. Contactez un administrateur de l'équipe.</p>
      </MessagePage>
    );
  }

  return (
    <TeamProvider>
      <EditorProvider>
        <Layout page={route.page}>
          {route.page === 'dashboard' && <DashboardPage />}
          {route.page === 'agenda' && <AgendaPage />}
          {route.page === 'admin' && <AdminPage />}
          {route.page === 'profile' && <ProfilePage />}
        </Layout>
      </EditorProvider>
    </TeamProvider>
  );
}

export function App() {
  if (!isConfigured) return <SetupPage />;
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
