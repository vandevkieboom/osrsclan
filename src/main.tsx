import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { ClanRankings } from "./page/time-served-page.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClanRankings />
  </StrictMode>,
);
