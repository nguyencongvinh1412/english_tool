/**
 * Main Application Component
 * Providers (i18n, toasts, auth, progress) and the route tree
 */

import type React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrowserWarning } from '@/components/BrowserWarning';
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
import { DictationPage } from '@/features/listening/DictationPage';
import { PronunciationPage } from '@/features/speaking/PronunciationPage';
import { ConversationPage } from '@/features/speaking/ConversationPage';
import { ScenariosPage } from '@/features/speaking/ScenariosPage';
import { IeltsSpeakingPage } from '@/features/speaking/IeltsSpeakingPage';
import { ListeningQuizPage } from '@/features/listening/ListeningQuizPage';
import { GapfillPage, ReadingPassagePage } from '@/features/reading/ReadingPages';
import { WritingPage } from '@/features/writing/WritingPage';
import { ProgressProvider } from '@/shared/progress';
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
              <ProgressProvider>
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

                      <Route path={ROUTES.DICTATION} element={<DictationPage />} />
                      <Route path={ROUTES.PRONUNCIATION} element={<PronunciationPage />} />
                      <Route path={ROUTES.CONVERSATION} element={<ConversationPage />} />
                      <Route path={ROUTES.SCENARIOS} element={<ScenariosPage />} />
                      <Route path={ROUTES.SPEAKING_IELTS} element={<IeltsSpeakingPage />} />
                      <Route path={ROUTES.LISTENING_QUIZ} element={<ListeningQuizPage />} />
                      <Route path={ROUTES.READING_PASSAGE} element={<ReadingPassagePage />} />
                      <Route path={ROUTES.READING_GAPFILL} element={<GapfillPage />} />
                      <Route path={ROUTES.WRITING_EMAIL} element={<WritingPage task="email" />} />
                      <Route path={ROUTES.WRITING_TASK1} element={<WritingPage task="ielts-task1" />} />
                      <Route path={ROUTES.WRITING_TASK2} element={<WritingPage task="ielts-task2" />} />

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
              </ProgressProvider>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
