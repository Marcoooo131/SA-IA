import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useStore } from './lib/store/store';
import { requestPersistentStorage } from './lib/db/idb';

void useStore.getState().load().then(() => {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 300);
  }
});
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
