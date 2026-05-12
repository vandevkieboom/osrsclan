import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles/index.css";
import { HomePage } from "./page/home-page.tsx";
import { ClanRankings } from "./page/time-served-page.tsx";
import { HiscoresPage } from "./page/hiscores-page.tsx";
import { ActivityPage } from "./page/activity-page.tsx";
import { Analytics } from "@vercel/analytics/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rankings" element={<ClanRankings />} />
        <Route path="/hiscores" element={<HiscoresPage />} />
        <Route path="/activity" element={<ActivityPage />} />
      </Routes>
    </BrowserRouter>
    <Analytics />
  </StrictMode>,
);
