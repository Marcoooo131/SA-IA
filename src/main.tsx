import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { startAutosave, useApp } from './state/store';

startAutosave();
window.addEventListener('beforeunload', () => useApp.getState().saveNow());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
