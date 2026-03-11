import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';

(function migrateHashToCleanUrl() {
  const hash = window.location.hash;
  if (!hash || hash === '#') return;

  if (hash.includes('type=recovery') || hash.includes('access_token=')) return;

  const stripped = hash.replace(/^#\/?/, '');
  if (!stripped) return;

  const qIdx = stripped.indexOf('?');
  const path = qIdx > -1 ? stripped.substring(0, qIdx) : stripped;
  const query = qIdx > -1 ? stripped.substring(qIdx) : '';

  const cleanUrl = '/' + path + query;
  window.history.replaceState(null, '', cleanUrl);
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LanguageProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LanguageProvider>
    </AuthProvider>
  </StrictMode>
);
