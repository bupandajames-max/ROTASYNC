import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './components/ui/ToastProvider';
import { ConfirmProvider } from './components/ui/ConfirmProvider';
import SupabaseAuthTest from './SupabaseAuthTest';

// Temporary Phase 0 Supabase spike harness, reachable only via
// ?supabaseTest=1 — see src/SupabaseAuthTest.tsx. Does not affect the
// normal app path at all. Delete this branch once Phase 0 is validated.
const isSupabaseTest = new URLSearchParams(window.location.search).has('supabaseTest');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseTest ? (
      <SupabaseAuthTest />
    ) : (
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    )}
  </StrictMode>,
);
