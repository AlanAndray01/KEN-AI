import { createBrowserRouter } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { AppShell } from "@/layouts/AppShell";
import { AuthLayout } from "@/layouts/AuthLayout";
import { WorkspaceLayout } from "@/layouts/WorkspaceLayout";
import { AdminRoute } from "@/routes/AdminRoute";
import { GuestRoute } from "@/routes/GuestRoute";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { ChatPage } from "@/pages/ChatPage";
import { SharePage } from "@/pages/SharePage";
import { SearchPage } from "@/pages/SearchPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { GptsPage } from "@/pages/GptsPage";
import { GptDetailPage } from "@/pages/GptDetailPage";
import { GptCreatePage } from "@/pages/GptCreatePage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SettingsAccountPage } from "@/pages/settings/SettingsAccountPage";
import { SettingsGeneralPage } from "@/pages/settings/SettingsGeneralPage";
import { SettingsAppearancePage } from "@/pages/settings/SettingsAppearancePage";
import { SettingsPersonalizationPage } from "@/pages/settings/SettingsPersonalizationPage";
import { SettingsMemoryPage } from "@/pages/settings/SettingsMemoryPage";
import { SettingsVoicePage } from "@/pages/settings/SettingsVoicePage";
import { SettingsNotificationsPage } from "@/pages/settings/SettingsNotificationsPage";
import { SettingsDataControlsPage } from "@/pages/settings/SettingsDataControlsPage";
import { SettingsModelsPage } from "@/pages/settings/SettingsModelsPage";
import { AdminProvidersPage } from "@/pages/admin/AdminProvidersPage";
import { AdminModelsPage } from "@/pages/admin/AdminModelsPage";
import { AdminUsagePage } from "@/pages/admin/AdminUsagePage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: CLIENT_ROUTES.home, element: <HomePage /> },
      { path: CLIENT_ROUTES.share, element: <SharePage /> },
      {
        element: <GuestRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: CLIENT_ROUTES.login, element: <LoginPage /> },
              { path: CLIENT_ROUTES.register, element: <RegisterPage /> },
              { path: CLIENT_ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
              { path: CLIENT_ROUTES.resetPassword, element: <ResetPasswordPage /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <WorkspaceLayout />,
            children: [
              { path: CLIENT_ROUTES.chat, element: <ChatPage /> },
              { path: CLIENT_ROUTES.chatConversation, element: <ChatPage /> },
              { path: CLIENT_ROUTES.search, element: <SearchPage /> },
              { path: CLIENT_ROUTES.library, element: <LibraryPage /> },
              { path: CLIENT_ROUTES.gpts, element: <GptsPage /> },
              { path: CLIENT_ROUTES.gptCreate, element: <GptCreatePage /> },
              { path: CLIENT_ROUTES.gptDetail, element: <GptDetailPage /> },
              { path: CLIENT_ROUTES.settings, element: <SettingsPage /> },
              { path: CLIENT_ROUTES.settingsAccount, element: <SettingsAccountPage /> },
              { path: CLIENT_ROUTES.settingsGeneral, element: <SettingsGeneralPage /> },
              { path: CLIENT_ROUTES.settingsAppearance, element: <SettingsAppearancePage /> },
              { path: CLIENT_ROUTES.settingsPersonalization, element: <SettingsPersonalizationPage /> },
              { path: CLIENT_ROUTES.settingsMemory, element: <SettingsMemoryPage /> },
              { path: CLIENT_ROUTES.settingsVoice, element: <SettingsVoicePage /> },
              { path: CLIENT_ROUTES.settingsNotifications, element: <SettingsNotificationsPage /> },
              { path: CLIENT_ROUTES.settingsDataControls, element: <SettingsDataControlsPage /> },
              { path: CLIENT_ROUTES.settingsModels, element: <SettingsModelsPage /> },
            ],
          },
        ],
      },
      {
        element: <AdminRoute />,
        children: [
          {
            element: <WorkspaceLayout />,
            children: [
              { path: CLIENT_ROUTES.adminProviders, element: <AdminProvidersPage /> },
              { path: CLIENT_ROUTES.adminModels, element: <AdminModelsPage /> },
              { path: CLIENT_ROUTES.adminUsage, element: <AdminUsagePage /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
