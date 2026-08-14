import { useEffect, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";
import { fetchBoard, submitTileProof, type BoardData } from "../services/board";
import {
  fetchAdminSubmissions,
  reviewSubmission,
  type AdminSubmission,
} from "../services/admin";
import { TeamCard } from "../components/bingo/team-card";
import { TileFace } from "../components/bingo/tile-face";
import { TileDetailPanel } from "../components/bingo/tile-detail-panel";
import { Lightbox } from "../components/bingo/lightbox";
import { AdminReview } from "../components/bingo/admin-review";
import {
  PLACEHOLDER_BOARD,
  PLACEHOLDER_SUBMISSIONS,
} from "../components/bingo/placeholders";

type View = "leaderboard" | "board" | "admin";

export function BingoPage() {
  const { user, isAdmin } = useAuth();
  const [view, setView] = useState<View>("leaderboard");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingTileId, setUploadingTileId] = useState<number | null>(null);
  const [boardTeamId, setBoardTeamId] = useState<number | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[] | null>(
    null,
  );

  function reloadBoard() {
    fetchBoard()
      .then((data) => {
        setBoard(data);
        setBoardTeamId(
          (prev) => prev ?? data.myTeamId ?? data.teams[0]?.id ?? null,
        );
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setBoard(PLACEHOLDER_BOARD);
          setBoardTeamId((prev) => prev ?? PLACEHOLDER_BOARD.myTeamId);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load board");
      });
  }

  // Re-fetch whenever the active tab changes, not just on first load — the
  // Admin Panel tab mutates teams/members/tiles state, so switching back to
  // Leaderboard/Board needs a fresh fetch to see it.
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

  async function handleSubmitProof(tileId: number, file: File) {
    setUploadingTileId(tileId);
    setError(null);
    try {
      await submitTileProof(tileId, file);
      reloadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit proof");
      throw err;
    } finally {
      setUploadingTileId(null);
    }
  }

  async function handleReview(
    id: number,
    decision: "approved" | "rejected",
    itemId?: number,
  ) {
    try {
      await reviewSubmission(id, decision, itemId);
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
            <p className="page-sub">
              There was a problem loading the bingo board.
            </p>
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

  const boardTeam =
    board.teams.find((t) => t.id === boardTeamId) ?? board.teams[0] ?? null;
  const selectedTile =
    boardTeam?.tiles.find((t) => t.tileId === selectedTileId) ?? null;
  const canSubmitToBoardTeam = !!boardTeam && boardTeam.id === board.myTeamId;

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
                First team to complete every tile on their board wins. Click a
                tile to see exactly what it needs, who's contributed, and to
                submit proof.
              </p>
            </div>
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
            BOARD
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

        {view === "board" && !boardTeam && (
          <div className="bingo-admin-empty">
            No teams have been created yet.
          </div>
        )}

        {view === "board" && boardTeam && (
          <>
            <div className="bingo-board-head">
              <div>
                <div className="bingo-board-title">
                  {boardTeam.name}'s Board
                </div>
              </div>
              <div className="bingo-board-head-stat">
                <div className="bingo-board-head-track">
                  <div
                    className="bingo-board-head-fill"
                    style={{
                      width: `${boardTeam.pct}%`,
                      background: boardTeam.accentColor,
                    }}
                  />
                </div>
                <div
                  className="bingo-board-head-count"
                  style={{ color: boardTeam.accentColor }}
                >
                  {boardTeam.completeCount} / {boardTeam.totalTiles}
                </div>
                <div className="bingo-board-head-label">TILES COMPLETE</div>
              </div>
            </div>

            <div className="bingo-team-switcher">
              {board.teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={`bingo-team-pill${team.id === boardTeam.id ? " active" : ""}`}
                  onClick={() => {
                    setBoardTeamId(team.id);
                    setSelectedTileId(null);
                  }}
                >
                  <span
                    className="bingo-team-pill-dot"
                    style={{ background: team.accentColor }}
                  />
                  {team.name}
                </button>
              ))}
            </div>

            <div className="bingo-board-layout">
              <div
                className="bingo-tiles-grid"
                style={{
                  gridTemplateColumns: `repeat(${board.config.size}, 1fr)`,
                }}
              >
                {boardTeam.tiles.map((tile) => (
                  <TileFace
                    key={tile.tileId}
                    tile={tile}
                    isSelected={tile.tileId === selectedTileId}
                    isUploading={uploadingTileId === tile.tileId}
                    onClick={() => setSelectedTileId(tile.tileId)}
                  />
                ))}
              </div>

              <div className="bingo-sidebar">
                <TileDetailPanel
                  tile={selectedTile}
                  accentColor={boardTeam.accentColor}
                  canSubmit={canSubmitToBoardTeam}
                  isLoggedIn={!!user}
                  viewingTeamName={boardTeam.name}
                  isUploading={uploadingTileId === selectedTile?.tileId}
                  onSubmit={async (file) => {
                    if (!selectedTile) return;
                    await handleSubmitProof(selectedTile.tileId, file);
                  }}
                  onOpenLightbox={setLightboxUrl}
                />
              </div>
            </div>
          </>
        )}

        {view === "admin" && isAdmin && (
          <AdminReview submissions={submissions} onReview={handleReview} />
        )}
      </div>

      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      <SiteFooter />
    </>
  );
}
