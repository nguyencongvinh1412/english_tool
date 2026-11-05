/**
 * Main Application Component
 * Providers (i18n, toasts, auth, progress) and the route tree
 */

import type React from 'react';
import { Suspense } from 'react';
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
import { TodayPage } from '@/features/today/TodayPage';
import { ProgressProvider } from '@/shared/progress';
import { EXAM_SESSION_ROUTE } from '@/features/exams/examRoutes';
import { lazyPage } from '@/app/lazyPage';
import { UpgradeListener } from '@/features/billing/UpgradeListener';
import { PageFallback } from '@/app/PageFallback';

/* Pages load on first visit; the dashboard and sign-in stay in the main bundle */
const PrivacyPage = lazyPage(() => import('@/features/privacy/PrivacyPage'), 'PrivacyPage');
const ResetPasswordPage = lazyPage(() => import('@/features/auth/ResetPasswordPage'), 'ResetPasswordPage');
const DictationPage = lazyPage(() => import('@/features/listening/DictationPage'), 'DictationPage');
const PronunciationPage = lazyPage(() => import('@/features/speaking/PronunciationPage'), 'PronunciationPage');
const ConversationPage = lazyPage(() => import('@/features/speaking/ConversationPage'), 'ConversationPage');
const ScenariosPage = lazyPage(() => import('@/features/speaking/ScenariosPage'), 'ScenariosPage');
const IeltsSpeakingPage = lazyPage(() => import('@/features/speaking/IeltsSpeakingPage'), 'IeltsSpeakingPage');
const ListeningQuizPage = lazyPage(() => import('@/features/listening/ListeningQuizPage'), 'ListeningQuizPage');
const GapfillPage = lazyPage(() => import('@/features/reading/ReadingPages'), 'GapfillPage');
const ReadingPassagePage = lazyPage(() => import('@/features/reading/ReadingPages'), 'ReadingPassagePage');
const WritingPage = lazyPage(() => import('@/features/writing/WritingPage'), 'WritingPage');
const ExamsPage = lazyPage(() => import('@/features/exams/ExamsPage'), 'ExamsPage');
const ExamSessionPage = lazyPage(() => import('@/features/exams/ExamSessionPage'), 'ExamSessionPage');
const RoadmapPage = lazyPage(() => import('@/features/roadmap/RoadmapPage'), 'RoadmapPage');
const CreateRoadmapPage = lazyPage(() => import('@/features/roadmap/CreateRoadmapPage'), 'CreateRoadmapPage');
const StageDetailPage = lazyPage(() => import('@/features/roadmap/StageDetailPage'), 'StageDetailPage');
const PlacementPage = lazyPage(() => import('@/features/placement/PlacementPage'), 'PlacementPage');
const CheckpointPage = lazyPage(() => import('@/features/roadmap/CheckpointPage'), 'CheckpointPage');
const PracticeHub = lazyPage(() => import('@/features/practice/PracticeHub'), 'PracticeHub');
const MePage = lazyPage(() => import('@/features/me/MePage'), 'MePage');
const PlanPage = lazyPage(() => import('@/features/me/PlanPage'), 'PlanPage');
const ProfilePage = lazyPage(() => import('@/features/profile/ProfilePage'), 'ProfilePage');
const AdminPage = lazyPage(() => import('@/features/admin/AdminPage'), 'AdminPage');
const KanaPage = lazyPage(() => import('@/features/japanese/KanaPage'), 'KanaPage');
const VocabPage = lazyPage(() => import('@/features/japanese/VocabPage'), 'VocabPage');
const EnVocabPage = lazyPage(() => import('@/features/vocab/EnVocabPage'), 'EnVocabPage');
const MapsPage = lazyPage(() => import('@/features/maps/MapsPage'), 'MapsPage');
const InstallGuidePage = lazyPage(() => import('@/features/me/InstallGuidePage'), 'InstallGuidePage');
const NotificationsPage = lazyPage(() => import('@/features/me/NotificationsPage'), 'NotificationsPage');
const NotificationSettingsPage = lazyPage(() => import('@/features/me/NotificationsPage'), 'NotificationSettingsPage');
const MapHistoryPage = lazyPage(() => import('@/features/maps/MapHistoryPage'), 'MapHistoryPage');
const MapEditorPage = lazyPage(() => import('@/features/maps/MapEditorPage'), 'MapEditorPage');
const GrammarPage = lazyPage(() => import('@/features/grammar/GrammarPage'), 'GrammarPage');
const GrammarPointPage = lazyPage(() => import('@/features/grammar/GrammarPointPage'), 'GrammarPointPage');
const TimelinePage = lazyPage(() => import('@/features/grammar/TimelinePage'), 'TimelinePage');
const GrammarDrillPage = lazyPage(() => import('@/features/grammar/GrammarDrillPage'), 'GrammarDrillPage');
const ComparePage = lazyPage(() => import('@/features/grammar/ComparePage'), 'ComparePage');
const DecisionPage = lazyPage(() => import('@/features/grammar/DecisionPage'), 'DecisionPage');
const JaDictationPage = lazyPage(() => import('@/features/japanese/JaListeningPages'), 'JaDictationPage');
const JaListeningPage = lazyPage(() => import('@/features/japanese/JaListeningPages'), 'JaListeningPage');
const JaReadingPage = lazyPage(() => import('@/features/japanese/JaReadingWritingPages'), 'JaReadingPage');
const JaWritingPage = lazyPage(() => import('@/features/japanese/JaReadingWritingPages'), 'JaWritingPage');
const JaConversationPage = lazyPage(() => import('@/features/japanese/JaSpeakingPages'), 'JaConversationPage');
const JaPronunciationPage = lazyPage(() => import('@/features/japanese/JaSpeakingPages'), 'JaPronunciationPage');
const JaScenariosPage = lazyPage(() => import('@/features/japanese/JaSpeakingPages'), 'JaScenariosPage');

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
                <UpgradeListener />
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    {/* Open to everyone: reset links may be opened while another account is signed in */}
                    <Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
                    <Route path={ROUTES.PRIVACY} element={<PrivacyPage />} />

                    <Route element={<PublicOnly />}>
                      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
                      <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
                    </Route>

                    <Route element={<RequireAuth />}>
                      <Route path={ROUTES.ONBOARDING} element={<OnboardingPage />} />
                    {/* Focus mode: the test runs outside the app shell */}
                    <Route path={EXAM_SESSION_ROUTE} element={<ExamSessionPage />} />
                    <Route path={ROUTES.PLACEMENT} element={<PlacementPage />} />

                      <Route element={<AppShell />}>
                        <Route path={ROUTES.HOME} element={<TodayPage />} />
                        <Route path={ROUTES.ROADMAP} element={<RoadmapPage />} />
                        <Route path={ROUTES.ROADMAP_NEW} element={<CreateRoadmapPage />} />
                        <Route path={`${ROUTES.ROADMAP_STAGE}/:index`} element={<StageDetailPage />} />
                        <Route path={`${ROUTES.CHECKPOINT}/:stage`} element={<CheckpointPage />} />
                        <Route path={`${ROUTES.PROGRESS}`} element={<RoadmapPage />} />
                        <Route path={ROUTES.PRACTICE} element={<PracticeHub />} />
                        <Route path={ROUTES.ME} element={<MePage />} />
                        <Route path={ROUTES.ME_PLAN} element={<PlanPage />} />
                        <Route path={ROUTES.ME_INSTALL} element={<InstallGuidePage />} />
                        <Route path={ROUTES.ME_NOTIFICATIONS} element={<NotificationsPage />} />
                        <Route path={ROUTES.ME_NOTIFICATION_SETTINGS} element={<NotificationSettingsPage />} />
                        <Route path={ROUTES.LISTENING} element={<Navigate to={ROUTES.PRACTICE} replace />} />
                        <Route path={ROUTES.READING} element={<Navigate to={ROUTES.PRACTICE} replace />} />
                        <Route path={ROUTES.SPEAKING} element={<Navigate to={ROUTES.PRACTICE} replace />} />
                        <Route path={ROUTES.WRITING} element={<Navigate to={ROUTES.PRACTICE} replace />} />
                        <Route path={ROUTES.EXAMS} element={<ExamsPage />} />
                        <Route path={ROUTES.ME_ACCOUNT} element={<ProfilePage />} />

                        <Route path={ROUTES.DICTATION} element={<DictationPage />} />
                        <Route path={ROUTES.PRONUNCIATION} element={<PronunciationPage />} />
                        <Route path={ROUTES.CONVERSATION} element={<ConversationPage />} />
                        <Route path={ROUTES.SCENARIOS} element={<ScenariosPage />} />
                        <Route path={ROUTES.KANA} element={<KanaPage />} />
                        <Route path={ROUTES.JA_VOCAB} element={<VocabPage />} />
                        <Route path={ROUTES.VOCABULARY} element={<EnVocabPage />} />
                                                <Route path={ROUTES.MAPS} element={<MapsPage />} />
                        <Route path={`${ROUTES.MAPS}/:mapId/history`} element={<MapHistoryPage />} />
                        <Route path={`${ROUTES.MAPS}/:mapId`} element={<MapEditorPage />} />
                        <Route path={ROUTES.GRAMMAR} element={<GrammarPage />} />
                                                  <Route path={`${ROUTES.GRAMMAR}/:pointId`} element={<GrammarPointPage />} />
                        <Route path={`${ROUTES.GRAMMAR}/timeline`} element={<TimelinePage />} />
                        <Route path={`${ROUTES.GRAMMAR}/drill`} element={<GrammarDrillPage />} />
                        <Route path={`${ROUTES.GRAMMAR}/compare/:a/:b`} element={<ComparePage />} />
                        <Route path={`${ROUTES.GRAMMAR}/decide/:treeId`} element={<DecisionPage />} />
                        <Route path={ROUTES.JA_DICTATION} element={<JaDictationPage />} />
                        <Route path={ROUTES.JA_LISTENING} element={<JaListeningPage />} />
                        <Route path={ROUTES.JA_READING} element={<JaReadingPage />} />
                        <Route path={ROUTES.JA_WRITING} element={<JaWritingPage />} />
                        <Route path={ROUTES.JA_PRONUNCIATION} element={<JaPronunciationPage />} />
                        <Route path={ROUTES.JA_CONVERSATION} element={<JaConversationPage />} />
                        <Route path={ROUTES.JA_SCENARIOS} element={<JaScenariosPage />} />
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

                    {/* URLs from before the five-section layout */}
                    <Route path="/progress" element={<Navigate to={ROUTES.PROGRESS} replace />} />
                    <Route path="/profile" element={<Navigate to={ROUTES.ME_ACCOUNT} replace />} />
                    <Route path="/pricing" element={<Navigate to={ROUTES.ME_PLAN} replace />} />
                    <Route path="/exams" element={<Navigate to={ROUTES.EXAMS} replace />} />

                    {/* Pre-v2 URLs */}
                    <Route path="/dictation" element={<Navigate to={ROUTES.DICTATION} replace />} />
                    <Route path="/pronunciation" element={<Navigate to={ROUTES.PRONUNCIATION} replace />} />
                    <Route path="/conversation" element={<Navigate to={ROUTES.CONVERSATION} replace />} />
                    <Route path="/scenarios" element={<Navigate to={ROUTES.SCENARIOS} replace />} />
                    <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
                  </Routes>
                </Suspense>
              </ProgressProvider>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
