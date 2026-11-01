import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Build de demonstração (página hospedada em moldura): navegação só dentro da página
const isEmbeddedDemo = import.meta.env.VITE_ROUTER === 'memory';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEmbeddedDemo ? (
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
);
