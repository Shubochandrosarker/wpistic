import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Remove the server-rendered loading skeleton once React takes over.
const skeleton = document.getElementById('wpistic-boot-skeleton');
if (skeleton) skeleton.remove();

const container = document.getElementById('wpistic-root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
