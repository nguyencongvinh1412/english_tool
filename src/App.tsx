/**
 * Main Application Component
 * Providers (i18n, auth, toasts) and the route tree
 */

import type React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrowserWarning } from '@/components/BrowserWarning';
import { ConversationPage, PronunciationPage, ScenariosPage, DictationPage } from '@/pages';
import { ToastProvider } from '@/design';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/app/AuthProvider';
import { AppShell } from '@/app/AppShell';
import { PublicOnly, RequireAdmin, RequireAuth } from '@/app/RouteGuards';
import { ROUTES } from '@/app/routes';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SkillHubPage } from '@/features/skills/SkillHubPage';
import { ActivityFrame } from '@/features/skills/ActivityFrame';
import { ExamsPage } from '@/features/exams/ExamsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { AdminPage } from '@/features/admin/AdminPage';

/**
 * Root application component with routing and error handling
 */
export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <BrowserWarning />
              <Routes>
                <Route element={<PublicOnly />}>
                  <Route path={ROUTES.LOGIN} element={<LoginPage />} />
                  <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
                </Route>

                <Route element={<RequireAuth />}>
                  <Route path={ROUTES.ONBOARDING} element={<OnboardingPage />} />

                  <Route element={<AppShell />}>
                    <Route path={ROUTES.HOME} element={<DashboardPage />} />
                    <Route path={ROUTES.LISTENING} element={<SkillHubPage skill="listening" />} />
                    <Route path={ROUTES.READING} element={<SkillHubPage skill="reading" />} />
                    <Route path={ROUTES.SPEAKING} element={<SkillHubPage skill="speaking" />} />
                    <Route path={ROUTES.WRITING} element={<SkillHubPage skill="writing" />} />
                    <Route path={ROUTES.EXAMS} element={<ExamsPage />} />
                    <Route path={ROUTES.PROFILE} element={<ProfilePage />} />

                    <Route path={ROUTES.DICTATION} element={<ActivityFrame skill="listening"><DictationPage /></ActivityFrame>} />
                    <Route path={ROUTES.PRONUNCIATION} element={<ActivityFrame skill="speaking"><PronunciationPage /></ActivityFrame>} />
                    <Route path={ROUTES.CONVERSATION} element={<ActivityFrame skill="speaking"><ConversationPage /></ActivityFrame>} />
                    <Route path={ROUTES.SCENARIOS} element={<ActivityFrame skill="speaking"><ScenariosPage /></ActivityFrame>} />

                    <Route element={<RequireAdmin />}>
                      <Route path={ROUTES.ADMIN} element={<AdminPage />} />
                    </Route>
                  </Route>
                </Route>

                {/* Pre-v2 URLs */}
                <Route path="/dictation" element={<Navigate to={ROUTES.DICTATION} replace />} />
                <Route path="/pronunciation" element={<Navigate to={ROUTES.PRONUNCIATION} replace />} />
                <Route path="/conversation" element={<Navigate to={ROUTES.CONVERSATION} replace />} />
                <Route path="/scenarios" element={<Navigate to={ROUTES.SCENARIOS} replace />} />
                <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
