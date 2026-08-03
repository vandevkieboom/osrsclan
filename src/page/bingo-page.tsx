import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { AdminPanelTabs } from "../components/admin-panel-tabs";
import { useAuth } from "../context/auth-context";
import {
  fetchBoard,
  submitTileProof,
  type BoardData,
  type MyTeamTile,
} from "../services/board";
import {
  fetchAdminSubmissions,
  reviewSubmission,
  type AdminSubmission,
} from "../services/admin";

type View = "leaderboard" | "board" | "admin" | "panel";

// Dev-only fallback so the page has something to render under plain
// `npm run dev`, which has no backend at all. Never used in production —
// `fetchBoard`/`fetchAdminSubmissions` failures there surface as real errors.
const PLACEHOLDER_ICON =
  "https://oldschool.runescape.wiki/images/Twisted_bow_detail.png";
const PLACEHOLDER_STATUSES = [
  "approved",
  "approved",
  "pending",
  "none",
  "rejected",
] as const;
const PLACEHOLDER_BOARD: BoardData = {
  config: {
    name: "Summer Blackout Bingo",
    dateRange: "Aug 2 – Aug 16, 2026",
    size: 5,
  },
  teams: [
    {
      id: 1,
      name: "Crimson Fang",
      memberCount: 6,
      members: [
        "izJordy",
        "AtomicKilo",
        "BreauxChacho",
        "BHops",
        "Lamboat",
        "YoonA",
      ],
      completeCount: 18,
      totalTiles: 25,
      pct: 72,
      accentColor: "#e8574a",
      isLeading: true,
    },
    {
      id: 2,
      name: "Onyx Talon",
      memberCount: 5,
      members: [
        "Indaco",
        "Treecio",
        "AnotherPlayer",
        "SomePlayer",
        "Solo Nostalg",
      ],
      completeCount: 9,
      totalTiles: 25,
      pct: 36,
      accentColor: "#c9c9c9",
      isLeading: false,
    },
    {
      id: 3,
      name: "Zenyte Vanguard",
      memberCount: 7,
      members: [
        "ABearCat",
        "Helesta",
        "Wafas",
        "Eskett",
        "Mevvz",
        "Player7",
        "Player8",
      ],
      completeCount: 14,
      totalTiles: 25,
      pct: 56,
      accentColor: "#ffb340",
      isLeading: false,
    },
  ],
  myTeam: {
    id: 1,
    name: "Crimson Fang",
    tiles: Array.from({ length: 25 }, (_, i) => ({
      tileId: i,
      name: `Tile ${i + 1}`,
      iconUrl: PLACEHOLDER_ICON,
      requiredCount: 1,
      approvedCount: PLACEHOLDER_STATUSES[i % PLACEHOLDER_STATUSES.length] === "approved" ? 1 : 0,
      pendingCount: PLACEHOLDER_STATUSES[i % PLACEHOLDER_STATUSES.length] === "pending" ? 1 : 0,
      rejectedCount: PLACEHOLDER_STATUSES[i % PLACEHOLDER_STATUSES.length] === "rejected" ? 1 : 0,
      status: PLACEHOLDER_STATUSES[i % PLACEHOLDER_STATUSES.length],
      latestProofUrl: null,
      latestSubmittedBy:
        PLACEHOLDER_STATUSES[i % PLACEHOLDER_STATUSES.length] === "none"
          ? null
          : "izJordy",
      proofs: [],
    })),
  },
};
const PLACEHOLDER_SUBMISSIONS: AdminSubmission[] = [
  {
    id: 1,
    status: "pending",
    proofUrl: null,
    teamName: "Crimson Fang",
    tileName: "Twisted Bow",
    iconUrl: PLACEHOLDER_ICON,
    submittedBy: "SomePlayer",
    createdAt: "2026-08-02T00:00:00.000Z",
  },
  {
    id: 2,
    status: "pending",
    proofUrl: null,
    teamName: "Onyx Talon",
    tileName: "Scythe of Vitur",
    iconUrl: PLACEHOLDER_ICON,
    submittedBy: "AnotherPlayer",
    createdAt: "2026-08-02T00:00:00.000Z",
  },
];

function TeamCard({ team }: { team: BoardData["teams"][number] }) {
  return (
    <div
      className="bingo-team-card"
      style={{ "--team-accent": team.accentColor } as React.CSSProperties}
    >
      {team.isLeading && (
        <div className="bingo-team-leading-badge">LEADING</div>
      )}
      <div className="bingo-team-name">{team.name}</div>
      <div className="bingo-team-members">
        {team.members.length > 0
          ? team.members.join(", ")
          : `${team.memberCount} members`}
      </div>
      <div className="bingo-team-progress-track">
        <div
          className="bingo-team-progress-fill"
          style={{ width: `${team.pct}%` }}
        />
      </div>
      <div className="bingo-team-count">
        {team.completeCount} / {team.totalTiles} tiles complete
      </div>
    </div>
  );
}

function BoardTile({
  tile,
  isUploading,
  onViewProofs,
  onClick,
}: {
  tile: MyTeamTile;
  isUploading: boolean;
  onViewProofs: (() => void) | null;
  onClick: () => void;
}) {
  const clickable = tile.approvedCount < tile.requiredCount;
  const title =
    tile.requiredCount > 1
      ? `${tile.approvedCount} of ${tile.requiredCount} proofs approved${tile.pendingCount > 0 ? `, ${tile.pendingCount} pending` : ""}`
      : tile.latestSubmittedBy
        ? `${tile.status === "approved" ? "Completed" : "Submitted"} by ${tile.latestSubmittedBy}`
        : undefined;
  return (
    <div className={`bingo-tile bingo-tile--${tile.status}`}>
      {tile.status === "approved" && (
        <span className="bingo-tile-status bingo-tile-status--approved">✓</span>
      )}
      {tile.status === "pending" && (
        <span className="bingo-tile-status bingo-tile-status--pending">⏳</span>
      )}
      {tile.status === "rejected" && (
        <span className="bingo-tile-status bingo-tile-status--rejected">✕</span>
      )}
      {onViewProofs && tile.proofs.length > 0 && (
        <button
          type="button"
          className="bingo-tile-proof-link bingo-tile-proofs-button"
          title="View proofs"
          aria-label="View proofs"
          onClick={(e) => {
            e.stopPropagation();
            onViewProofs();
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="bingo-tile-proof-icon"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="5.5" />
            <path d="M15.5 15.5 20 20" />
          </svg>
        </button>
      )}
      <button
        type="button"
        className="bingo-tile-body"
        onClick={onClick}
        disabled={!clickable || isUploading}
        title={title}
      >
        <img src={tile.iconUrl} alt="" className="bingo-tile-icon" />
        <div className="bingo-tile-name">
          {isUploading ? "Uploading…" : tile.name}
        </div>
        {tile.requiredCount > 1 ? (
          <div className="bingo-tile-completed-by">
            {tile.approvedCount} of {tile.requiredCount} proofs
          </div>
        ) : tile.latestSubmittedBy ? (
          <div className="bingo-tile-completed-by">{tile.latestSubmittedBy}</div>
        ) : null}
      </button>
    </div>
  );
}

function ProofGalleryModal({
  tile,
  onClose,
}: {
  tile: MyTeamTile;
  onClose: () => void;
}) {
  return (
    <div className="bingo-proof-modal-backdrop" onClick={onClose}>
      <div className="bingo-proof-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bingo-proof-modal-head">
          <div>
            <div className="bingo-proof-modal-title">{tile.name}</div>
            <div className="bingo-proof-modal-subtitle">
              {tile.approvedCount} / {tile.requiredCount} approved
            </div>
          </div>
          <button type="button" className="admin-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="bingo-proof-list">
          {tile.proofs.map((proof) => (
            <a
              key={proof.id}
              href={proof.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="bingo-proof-item"
            >
              <div className="bingo-proof-item-meta">
                <span className={`bingo-proof-pill bingo-proof-pill--${proof.status}`}>
                  {proof.status}
                </span>
                <span>{proof.submittedBy ?? "Unknown"}</span>
                <span>{new Date(proof.createdAt).toLocaleString()}</span>
              </div>
              <div className="bingo-proof-item-url">Open proof</div>
            </a>
          ))}
          {tile.proofs.length === 0 && (
            <div className="admin-empty">No proofs uploaded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BingoPage() {
  const { user, isAdmin, login } = useAuth();
  const [view, setView] = useState<View>("leaderboard");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingTileId, setUploadingTileId] = useState<number | null>(null);
  const [selectedProofTile, setSelectedProofTile] = useState<MyTeamTile | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[] | null>(
    null,
  );
  const pendingTileId = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reloadBoard() {
    fetchBoard()
      .then(setBoard)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setBoard(PLACEHOLDER_BOARD);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load board");
      });
  }

  // Re-fetch whenever the active tab changes, not just on first load — the
  // Admin Panel tab mutates teams/members/tiles in its own local state, so
  // switching back to Leaderboard/My Team Board needs a fresh fetch to see it.
  useEffect(reloadBoard, [view]);

  function reloadSubmissions() {
    if (!isAdmin) {
      Promise.resolve(null).then(setSubmissions);
      return;
    }
    fetchAdminSubmissions("pending")
      .then(setSubmissions)
      .catch(() =>
        setSubmissions(import.meta.env.DEV ? PLACEHOLDER_SUBMISSIONS : null),
      );
  }

  useEffect(reloadSubmissions, [isAdmin, view]);

  function handleTileClick(tileId: number) {
    pendingTileId.current = tileId;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const tileId = pendingTileId.current;
    e.target.value = "";
    if (!file || tileId === null) return;

    setUploadingTileId(tileId);
    setError(null);
    try {
      await submitTileProof(tileId, file);
      reloadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit proof");
    } finally {
      setUploadingTileId(null);
    }
  }

  async function handleReview(id: number, decision: "approved" | "rejected") {
    try {
      await reviewSubmission(id, decision);
      reloadSubmissions();
      reloadBoard();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to review submission",
      );
    }
  }

  if (error && !board) {
    return (
      <>
        <SiteHeader />
        <div className="page">
          <div className="page-head">
            <div className="page-eyebrow">Clan Event</div>
            <h1 className="page-title">Bingo</h1>
          </div>
          <div className="admin-error">{error}</div>
        </div>
        <SiteFooter />
      </>
    );
  }

  if (!board) {
    return (
      <>
        <SiteHeader />
        <div className="page">
          <div className="page-head">
            <div className="page-eyebrow">Clan Event</div>
            <h1 className="page-title">Bingo</h1>
          </div>
          <p className="page-sub">Loading…</p>
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />

      <div className="page">
        <div className="page-head">
          <div className="page-head-row">
            <div className="page-head-text">
              <div className="page-eyebrow">Clan Event</div>
              <h1 className="page-title">{board.config.name}</h1>
              <p className="page-sub">
                First team to complete every tile on their board wins. Submit a
                screenshot for each required proof. Some tiles need multiple
                screenshots, and they can come from different team members.
              </p>
            </div>
            {board.config.dateRange && (
              <div className="bingo-date-range">{board.config.dateRange}</div>
            )}
          </div>
        </div>

        <div className="bingo-tabs">
          <button
            type="button"
            className={`bingo-tab${view === "leaderboard" ? " active" : ""}`}
            onClick={() => setView("leaderboard")}
          >
            LEADERBOARD
          </button>
          <button
            type="button"
            className={`bingo-tab${view === "board" ? " active" : ""}`}
            onClick={() => setView("board")}
          >
            MY TEAM BOARD
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                className={`bingo-tab${view === "admin" ? " active" : ""}`}
                onClick={() => setView("admin")}
              >
                ADMIN REVIEW
                {submissions && submissions.length > 0 && (
                  <span className="bingo-tab-badge">{submissions.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`bingo-tab${view === "panel" ? " active" : ""}`}
                onClick={() => setView("panel")}
              >
                ADMIN PANEL
              </button>
            </>
          )}
        </div>

        {error && <div className="admin-error">{error}</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: "none" }}
          onChange={handleFileSelected}
        />

        {view === "leaderboard" && (
          <div className="bingo-teams-grid">
            {board.teams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
            {board.teams.length === 0 && (
              <div className="admin-empty">No teams yet.</div>
            )}
          </div>
        )}

        {view === "board" && (
          <>
            {!user && (
              <div className="bingo-admin-empty">
                Log in with Discord to view your team's board.
                <div className="bingo-login-prompt">
                  <button
                    type="button"
                    className="site-header-login"
                    onClick={() => login()}
                  >
                    Log in with Discord
                  </button>
                </div>
              </div>
            )}
            {user && !board.myTeam && (
              <div className="bingo-admin-empty">
                You haven't been assigned to a team yet.
              </div>
            )}
            {user && board.myTeam && (
              <>
                <div className="bingo-board-head">
                  <div className="bingo-board-title">
                    {board.myTeam.name}'s Board
                  </div>
                  <div className="bingo-board-count">
                    {
                      board.myTeam.tiles.filter((t) => t.status === "approved")
                        .length
                    }{" "}
                    / {board.myTeam.tiles.length} complete
                  </div>
                </div>
                <div
                  className="bingo-tiles-grid"
                  style={{
                    gridTemplateColumns: `repeat(${board.config.size}, 1fr)`,
                  }}
                >
                  {board.myTeam.tiles.map((tile) => (
                    <BoardTile
                      key={tile.tileId}
                      tile={tile}
                      isUploading={uploadingTileId === tile.tileId}
                      onViewProofs={tile.proofs.length > 0 ? () => setSelectedProofTile(tile) : null}
                      onClick={() => handleTileClick(tile.tileId)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {view === "admin" && isAdmin && (
          <div className="bingo-admin-list">
            {(!submissions || submissions.length === 0) && (
              <div className="bingo-admin-empty">No pending submissions.</div>
            )}
            {submissions?.map((sub) => (
              <div key={sub.id} className="bingo-admin-row">
                <img src={sub.iconUrl} alt="" className="bingo-admin-icon" />
                <div className="bingo-admin-info">
                  <div className="bingo-admin-tile-name">{sub.tileName}</div>
                  <div className="bingo-admin-meta">
                    {sub.teamName} · submitted by {sub.submittedBy}
                  </div>
                  <div className="bingo-admin-meta bingo-admin-meta--timestamp">
                    {new Date(sub.createdAt).toLocaleString()}
                  </div>
                </div>
                {sub.proofUrl && (
                  <a
                    href={sub.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bingo-admin-proof-link"
                  >
                    View proof
                  </a>
                )}
                <button
                  type="button"
                  className="bingo-admin-approve"
                  onClick={() => handleReview(sub.id, "approved")}
                >
                  APPROVE
                </button>
                <button
                  type="button"
                  className="bingo-admin-reject"
                  onClick={() => handleReview(sub.id, "rejected")}
                >
                  REJECT
                </button>
              </div>
            ))}
          </div>
        )}

        {view === "panel" && isAdmin && <AdminPanelTabs />}
      </div>

      {selectedProofTile && (
        <ProofGalleryModal
          tile={selectedProofTile}
          onClose={() => setSelectedProofTile(null)}
        />
      )}

      <SiteFooter />
    </>
  );
}
