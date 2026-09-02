import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CLIENT_ROUTES } from "@Ken/shared";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "@/App";
import { QUERY_STALE_MS } from "@/query";
import { hideBootLoader } from "@/utils/bootLoader";
import { showLandingPage } from "@/utils/featureFlags";
import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: QUERY_STALE_MS,
    },
  },
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

if (window.location.pathname.startsWith("/chat")) {
  void import("@/pages/ChatPage");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// The landing page keeps the boot loader up until its hero scenes are ready, so
// the two never cross-fade against each other. Every other route drops it as
// soon as React has painted, and the failsafe covers a chunk that never loads.
const landingHoldsBoot =
  showLandingPage && window.location.pathname === CLIENT_ROUTES.home;

if (!landingHoldsBoot) {
  requestAnimationFrame(() => requestAnimationFrame(() => hideBootLoader("instant")));
}

window.setTimeout(() => hideBootLoader("instant"), 8000);
