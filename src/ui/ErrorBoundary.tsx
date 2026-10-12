import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Évite qu'une erreur d'affichage (ex. WebGL indisponible) ne bloque toute l'application. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: (e: Error, reset: () => void) => ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Une erreur d'affichage est survenue.</p>
          <p className="mt-1">{this.state.error.message}</p>
          <p className="mt-1 text-red-700">Vos données sont conservées dans le stockage local du navigateur.</p>
          <button className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1" onClick={this.reset}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
