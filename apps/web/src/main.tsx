import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store.tsx';
import { App } from './App.tsx';
import './styles/base.css';
import './styles/views.css';
import './styles/components.css';
import './styles/features.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
