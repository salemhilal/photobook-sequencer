import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';
import App from './App.tsx';
import { applyDeskColor } from './deskColor';
import { ui } from './ui';
import { startOfflineSupport } from './update';

applyDeskColor(ui.get().deskColor);
// The website works offline through a service worker; the Mac app has everything built in.
if (!__NATIVE_APP__) startOfflineSupport();
else void import('./native').then((m) => m.startNative());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
