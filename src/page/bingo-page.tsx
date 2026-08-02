import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";
import { fetchBoard, submitTileProof, type BoardData, type MyTeamTile } from "../services/board";
import { fetchAdminSubmissions, reviewSubmission, type AdminSubmission } from "../services/admin";

type View = "leaderboard" | "board" | "admin";

function TeamCard({ team }: { team: BoardData["teams"][number] }) {
  return (
    <div className="bingo-team-card" style={{ "--team-accent": team.accentColor } as React.CSSProperties}>
      {team.isLeading && <div className="bingo-team-leading-badge">LEADING</div>}
      <div className="bingo-team-name">{team.name}</div>
      <div className="bingo-team-members">{team.memberCount} members</div>
      <div className="bingo-team-progress-track">
        <div className="bingo-team-progress-fill" style={{ width: `${team.pct}%` }} />
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
  onClick,
}: {
  tile: MyTeamTile;
  isUploading: boolean;
  onClick: () => void;
}) {
  const clickable = tile.status === "none" || tile.status === "rejected";
  return (
    <button
      type="button"
      className={`bingo-tile bingo-tile--${tile.status}`}
      onClick={onClick}
      disabled={!clickable || isUploading}
    >
      {tile.status === "approved" && (
        <span className="bingo-tile-status bingo-tile-status--approved">✓</span>
      )}
      {tile.status === "pending" && (
        <span className="bingo-tile-status bingo-tile-status--pending">⏳</span>
      )}
      {tile.status === "rejected" && (
        <span className="bingo-tile-status bingo-tile-status--rejected">✕</span>
      )}
      <img src={tile.iconUrl} alt="" className="bingo-tile-icon" />
      <div className="bingo-tile-name">{isUploading ? "Uploading…" : tile.name}</div>
    </button>
  );
}

export function BingoPage() {
  const { isAdmin } = useAuth();
  const [view, setView] = useState<View>("leaderboard");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingTileId, setUploadingTileId] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[] | null>(null);
  const pendingTileId = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reloadBoard() {
    fetchBoard()
      .then(setBoard)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load board"));
  }

  useEffect(reloadBoard, []);

  function reloadSubmissions() {
    if (!isAdmin) return;
    fetchAdminSubmissions("pending")
      .then(setSubmissions)
      .catch(() => setSubmissions(null));
  }

  useEffect(reloadSubmissions, [isAdmin]);

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
      setError(err instanceof Error ? err.message : "Failed to review submission");
    }
  }

  if (error && !board) {
    return (
      <>
        <SiteHeader />
        <div className="page">
          <div className="page-head">
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
              <h1 className="page-title">{board.config.name}</h1>
            </div>
            {board.config.dateRange && <div className="bingo-date-range">{board.config.dateRange}</div>}
          </div>
          <p className="page-sub">
            First team to complete every tile on their board wins. Submit a screenshot for a
            tile once you've gotten the drop — an officer will review and approve it.
          </p>
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
            {board.teams.length === 0 && <div className="admin-empty">No teams yet.</div>}
          </div>
        )}

        {view === "board" && (
          <>
            {!board.myTeam && (
              <div className="bingo-admin-empty">
                You haven't been assigned to a team yet — ask an admin to add you to one.
              </div>
            )}
            {board.myTeam && (
              <>
                <div className="bingo-board-head">
                  <div className="bingo-board-title">{board.myTeam.name}'s Board</div>
                  <div className="bingo-board-count">
                    {board.myTeam.tiles.filter((t) => t.status === "approved").length} /{" "}
                    {board.myTeam.tiles.length} complete
                  </div>
                </div>
                <div
                  className="bingo-tiles-grid"
                  style={{ gridTemplateColumns: `repeat(${board.config.size}, 1fr)` }}
                >
                  {board.myTeam.tiles.map((tile) => (
                    <BoardTile
                      key={tile.tileId}
                      tile={tile}
                      isUploading={uploadingTileId === tile.tileId}
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
                </div>
                {sub.proofUrl && (
                  <a href={sub.proofUrl} target="_blank" rel="noreferrer" className="bingo-admin-proof-link">
                    View proof
                  </a>
                )}
                <button type="button" className="bingo-admin-approve" onClick={() => handleReview(sub.id, "approved")}>
                  APPROVE
                </button>
                <button type="button" className="bingo-admin-reject" onClick={() => handleReview(sub.id, "rejected")}>
                  REJECT
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </>
  );
}
