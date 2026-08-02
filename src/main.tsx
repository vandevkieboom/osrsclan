import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles/index.css";
import { HomePage } from "./page/home-page.tsx";
import { ClanRankings } from "./page/time-served-page.tsx";
import { HiscoresPage } from "./page/hiscores-page.tsx";
import { ActivityPage } from "./page/activity-page.tsx";
import { TierFeedbackPage } from "./page/tier-feedback-page.tsx";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "./context/auth-context.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rankings" element={<ClanRankings />} />
          <Route path="/hiscores" element={<HiscoresPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/rankings-feedback" element={<TierFeedbackPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    <Analytics />
  </StrictMode>,
);
