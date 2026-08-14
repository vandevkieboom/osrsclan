import { useState } from "react";
import { BroadcastPanel } from "./admin/broadcast-panel";
import { TeamsPanel } from "./admin/teams-panel";
import { MembersPanel } from "./admin/members-panel";
import { DonationsPanel } from "./admin/donations-panel";
import { BoardConfigPanel } from "./admin/board-config-panel";
import { TilesPanel } from "./admin/tiles-panel";

type PanelTab = "teams" | "members" | "donations" | "board" | "tiles";

export function AdminPanelTabs() {
  const [panelTab, setPanelTab] = useState<PanelTab>("teams");

  return (
    <div>
      <BroadcastPanel />

      <div className="bingo-tabs">
        <button
          type="button"
          className={`bingo-tab${panelTab === "teams" ? " active" : ""}`}
          onClick={() => setPanelTab("teams")}
        >
          TEAMS
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "members" ? " active" : ""}`}
          onClick={() => setPanelTab("members")}
        >
          MEMBERS
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "donations" ? " active" : ""}`}
          onClick={() => setPanelTab("donations")}
        >
          DONATIONS
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "board" ? " active" : ""}`}
          onClick={() => setPanelTab("board")}
        >
          BINGO CONFIG
        </button>
        <button
          type="button"
          className={`bingo-tab${panelTab === "tiles" ? " active" : ""}`}
          onClick={() => setPanelTab("tiles")}
        >
          TILES
        </button>
      </div>

      {panelTab === "teams" && <TeamsPanel />}
      {panelTab === "members" && <MembersPanel />}
      {panelTab === "donations" && <DonationsPanel />}
      {panelTab === "board" && <BoardConfigPanel />}
      {panelTab === "tiles" && <TilesPanel />}
    </div>
  );
}
