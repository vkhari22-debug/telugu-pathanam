import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// StrictMode is intentionally not used: its double-mounted effects would
// tear down the long-lived speech controller's audio handlers in development.
createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
