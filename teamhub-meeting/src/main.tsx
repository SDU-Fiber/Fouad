import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

// No <StrictMode>: its dev-only double mount would open every WebRTC connection twice.
createRoot(document.getElementById('root')!).render(<App />);
