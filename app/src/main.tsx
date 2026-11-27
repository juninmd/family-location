import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '@juninmd/sonido';
import App from './App';
import '@juninmd/sonido/styles.css';
import './styles.css';
import { isNative } from './lib/native';
import { Toaster } from './ui/Toaster';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
      <Toaster />
    </ToastProvider>
  </StrictMode>,
);

// PWA: app shell e tiles do mapa em cache para abrir offline (no app nativo o WebView já cacheia).
if ('serviceWorker' in navigator && !isNative && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
