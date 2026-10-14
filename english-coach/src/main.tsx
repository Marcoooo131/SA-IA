import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { loadStore } from './core/store';
import { requestPersistentStorage } from './core/db';
import { initPwa, initViewport } from './ui/pwa';
import './ui/styles.css';

initPwa();
initViewport();

async function start() {
  await loadStore();
  void requestPersistentStorage();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 300);
  }
}

void start();
