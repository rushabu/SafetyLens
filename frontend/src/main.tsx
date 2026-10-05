import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./index.css";
import EvaluationPage from "./pages/Evaluation";
import LandingPage from "./pages/Landing";
import MethodPage from "./pages/Method";
import OverviewPage from "./pages/Overview";
import PatternsPage from "./pages/Patterns";
import ReportDetailPage from "./pages/ReportDetail";
import ReportsPage from "./pages/Reports";
import UploadPage from "./pages/Upload";

// Theme: stored preference, else the OS setting.
(() => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("safetylens-theme");
  } catch {
    /* storage unavailable */
  }
  const dark = stored ? stored === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function NotFound() {
  return <p className="text-sm text-ink-2">Page not found.</p>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route element={<Layout />}>
            <Route path="overview" element={<OverviewPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:id" element={<ReportDetailPage />} />
            <Route path="patterns" element={<PatternsPage />} />
            <Route path="evaluation" element={<EvaluationPage />} />
            <Route path="method" element={<MethodPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
