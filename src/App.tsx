/**
 * Main Application Component
 * Sets up routing, error boundary, and browser compatibility checks
 */

import type React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrowserWarning } from '@/components/BrowserWarning';
import { Layout } from '@/components/Layout';
import { AuthGate } from '@/components/AuthGate';
import {
  HomePage,
  ConversationPage,
  PronunciationPage,
  ScenariosPage,
  DictationPage,
} from '@/pages';
import { ROUTES } from '@/constants';
import './App.css';

/**
 * Root application component with routing and error handling
 * Wrapped in ErrorBoundary to catch unhandled errors
 * BrowserWarning displays compatibility notices when needed
 */
export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <BrowserWarning />
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path={ROUTES.HOME} element={<HomePage />} />
              <Route path={ROUTES.CONVERSATION} element={<ConversationPage />} />
              <Route path={ROUTES.PRONUNCIATION} element={<PronunciationPage />} />
              <Route path={ROUTES.SCENARIOS} element={<ScenariosPage />} />
              <Route path={ROUTES.DICTATION} element={<DictationPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </ErrorBoundary>
  );
}
