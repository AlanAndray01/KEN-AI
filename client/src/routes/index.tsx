import { createBrowserRouter, Navigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { AppShell } from "@/layouts/AppShell";
import { AuthLayout } from "@/layouts/AuthLayout";
import { WorkspaceLayout } from "@/layouts/WorkspaceLayout";
import { AdminRoute } from "@/routes/AdminRoute";
import { GuestRoute } from "@/routes/GuestRoute";
import { LandingRoute } from "@/routes/LandingRoute";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { showLandingPage } from "@/utils/featureFlags";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        path: CLIENT_ROUTES.home,
        // The landing page is a local-testing surface. When it is switched off
        // the chunk below is never fetched and `/` redirects instead.
        ...(showLandingPage
          ? {
              lazy: async () => {
                const { HomePage } = await import("@/pages/HomePage");
                return { Component: HomePage };
              },
            }
          : { element: <LandingRoute /> }),
      },
      {
        // Public and unauthenticated: Google's OAuth consent screen links here,
        // and a visitor must be able to read these before creating an account.
        path: CLIENT_ROUTES.privacy,
        lazy: async () => {
          const { PrivacyPage } = await import("@/pages/PrivacyPage");
          return { Component: PrivacyPage };
        },
      },
      {
        path: CLIENT_ROUTES.terms,
        lazy: async () => {
          const { TermsPage } = await import("@/pages/TermsPage");
          return { Component: TermsPage };
        },
      },
      {
        path: CLIENT_ROUTES.share,
        lazy: async () => {
          const { SharePage } = await import("@/pages/SharePage");
          return { Component: SharePage };
        },
      },
      {
        element: <GuestRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              {
                path: CLIENT_ROUTES.login,
                lazy: async () => {
                  const { LoginPage } = await import("@/pages/LoginPage");
                  return { Component: LoginPage };
                },
              },
              {
                path: CLIENT_ROUTES.register,
                lazy: async () => {
                  const { RegisterPage } = await import("@/pages/RegisterPage");
                  return { Component: RegisterPage };
                },
              },
              {
                path: CLIENT_ROUTES.forgotPassword,
                lazy: async () => {
                  const { ForgotPasswordPage } = await import("@/pages/ForgotPasswordPage");
                  return { Component: ForgotPasswordPage };
                },
              },
              {
                path: CLIENT_ROUTES.resetPassword,
                lazy: async () => {
                  const { ResetPasswordPage } = await import("@/pages/ResetPasswordPage");
                  return { Component: ResetPasswordPage };
                },
              },
              {
                path: CLIENT_ROUTES.verifyEmail,
                lazy: async () => {
                  const { VerifyEmailPage } = await import("@/pages/VerifyEmailPage");
                  return { Component: VerifyEmailPage };
                },
              },
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
              {
                path: "/chat/:conversationId?",
                lazy: async () => {
                  const { ChatPage } = await import("@/pages/ChatPage");
                  return { Component: ChatPage };
                },
              },
              {
                path: CLIENT_ROUTES.search,
                lazy: async () => {
                  const { SearchPage } = await import("@/pages/SearchPage");
                  return { Component: SearchPage };
                },
              },
              { path: CLIENT_ROUTES.history, element: <Navigate to={CLIENT_ROUTES.search} replace /> },
              {
                path: CLIENT_ROUTES.library,
                lazy: async () => {
                  const { LibraryPage } = await import("@/pages/LibraryPage");
                  return { Component: LibraryPage };
                },
              },
              {
                path: CLIENT_ROUTES.gpts,
                lazy: async () => {
                  const { GptsPage } = await import("@/pages/GptsPage");
                  return { Component: GptsPage };
                },
              },
              {
                path: CLIENT_ROUTES.gptCreate,
                lazy: async () => {
                  const { GptCreatePage } = await import("@/pages/GptCreatePage");
                  return { Component: GptCreatePage };
                },
              },
              {
                path: CLIENT_ROUTES.gptDetail,
                lazy: async () => {
                  const { GptDetailPage } = await import("@/pages/GptDetailPage");
                  return { Component: GptDetailPage };
                },
              },
              {
                path: CLIENT_ROUTES.settings,
                lazy: async () => {
                  const { SettingsPage } = await import("@/pages/settings/SettingsPage");
                  return { Component: SettingsPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsAccount,
                lazy: async () => {
                  const { SettingsAccountPage } = await import("@/pages/settings/SettingsAccountPage");
                  return { Component: SettingsAccountPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsGeneral,
                lazy: async () => {
                  const { SettingsGeneralPage } = await import("@/pages/settings/SettingsGeneralPage");
                  return { Component: SettingsGeneralPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsAppearance,
                lazy: async () => {
                  const { SettingsAppearancePage } = await import("@/pages/settings/SettingsAppearancePage");
                  return { Component: SettingsAppearancePage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsPersonalization,
                lazy: async () => {
                  const { SettingsPersonalizationPage } = await import("@/pages/settings/SettingsPersonalizationPage");
                  return { Component: SettingsPersonalizationPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsMemory,
                lazy: async () => {
                  const { SettingsMemoryPage } = await import("@/pages/settings/SettingsMemoryPage");
                  return { Component: SettingsMemoryPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsVoice,
                lazy: async () => {
                  const { SettingsVoicePage } = await import("@/pages/settings/SettingsVoicePage");
                  return { Component: SettingsVoicePage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsNotifications,
                lazy: async () => {
                  const { SettingsNotificationsPage } = await import("@/pages/settings/SettingsNotificationsPage");
                  return { Component: SettingsNotificationsPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsDataControls,
                lazy: async () => {
                  const { SettingsDataControlsPage } = await import("@/pages/settings/SettingsDataControlsPage");
                  return { Component: SettingsDataControlsPage };
                },
              },
              {
                path: CLIENT_ROUTES.settingsModels,
                lazy: async () => {
                  const { SettingsModelsPage } = await import("@/pages/settings/SettingsModelsPage");
                  return { Component: SettingsModelsPage };
                },
              },
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
              {
                path: CLIENT_ROUTES.adminProviders,
                lazy: async () => {
                  const { AdminProvidersPage } = await import("@/pages/admin/AdminProvidersPage");
                  return { Component: AdminProvidersPage };
                },
              },
              {
                path: CLIENT_ROUTES.adminModels,
                lazy: async () => {
                  const { AdminModelsPage } = await import("@/pages/admin/AdminModelsPage");
                  return { Component: AdminModelsPage };
                },
              },
              {
                path: CLIENT_ROUTES.adminUsage,
                lazy: async () => {
                  const { AdminUsagePage } = await import("@/pages/admin/AdminUsagePage");
                  return { Component: AdminUsagePage };
                },
              },
            ],
          },
        ],
      },
      {
        path: "*",
        lazy: async () => {
          const { NotFoundPage } = await import("@/pages/NotFoundPage");
          return { Component: NotFoundPage };
        },
      },
    ],
  },
]);
