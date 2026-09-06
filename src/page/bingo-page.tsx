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
  // Only ever set by the user actually clicking a team tab. The default is
  // derived below rather than stored, because the two things it depends on
  // (the session, for "my team", and the board, for "some team") arrive
  // independently and in no guaranteed order — seeding state from whichever
  // landed first meant a slow session load left you looking at some other
  // team's board with no way to tell that wasn't deliberate.
  const [pickedTeamId, setPickedTeamId] = useState<number | null>(null);

  // Keep the board live while somebody is actually looking at it.
  //
  // This page used to fetch once on load and then sit there, so your own
  // submissions appeared instantly (those refetch on the spot) but a
  // teammate's never did until you reloaded - during an event, which is the
  // one time the board matters, it was quietly minutes out of date. A board
  // that doesn't move while you watch it is the whole reason people ask
  // whether something is broken.
  //
  // Cheap, because of two things. The response is cached at the edge for 20s
  // and is identical for every viewer, so a room full of people watching the
  // board costs about the same as one person watching it. And it stops dead
  // when the tab isn't visible - nobody needs a live board in a background
  // tab, and that is where most open tabs spend their time.
  // 60s, matching the plugin's cadence for members competing in an event, so
  // the whole system has one answer: things land within about a minute.
  //
  // Not faster, because faster buys nothing. The response is edge-cached for
  // 20s, so polling more often than that just hits the cache again - it
  // doubles the request count for no reduction in server work and no
  // difference anyone can perceive mid-drop.
  const BOARD_POLL_MS = 60_000;
  useEffect(() => {
    if (view === "admin") return;

    let timer: number | undefined;
    let lastInteraction = Date.now();

    // A visible tab isn't the same as a watched one. Someone parking the board
    // on a second monitor and going to bed would otherwise poll all night, so
    // polling stops after a spell of no input and picks straight back up on
    // the next one - by which point they get a fresh board anyway.
    const IDLE_CUTOFF_MS = 15 * 60_000;
    const noteInteraction = () => {
      const wasIdle = Date.now() - lastInteraction > IDLE_CUTOFF_MS;
      lastInteraction = Date.now();
      if (wasIdle) reloadBoard();
    };

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction > IDLE_CUTOFF_MS) return;
      reloadBoard();
    };

    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, BOARD_POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Coming back to the tab should show the current board straight away,
        // not whatever it was showing when it was hidden.
        reloadBoard();
        start();
      } else {
        window.clearInterval(timer);
      }
    };

    const interactionEvents = ["pointerdown", "keydown", "scroll"] as const;

    // This effect re-runs on every `view` change (see the dependency array
    // below), including switching *into* Board from Admin or Leaderboard -
    // that used to only restart the 60s timer, not fetch anything, so an
    // admin who'd just approved something and switched tabs to check still
    // saw whatever was cached from before they left, for up to another full
    // minute. Fetching immediately here is the same "don't make someone wait
    // on a stale view" reasoning as onVisibility's reload below.
    if (document.visibilityState === "visible") {
      reloadBoard();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    for (const evt of interactionEvents) {
      window.addEventListener(evt, noteInteraction, { passive: true });
    }
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const evt of interactionEvents) {
        window.removeEventListener(evt, noteInteraction);
      }
    };
    // Deliberately keyed on `view` alone: reloadBoard is redefined every
    // render, so depending on it would tear down and rebuild the interval on
    // every render, which is exactly what this must not do.
  }, [view]);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[] | null>(
    null,
  );
  // Review-queue narrowing — at a 200-person clan's scale the flat pending
  // list can span every team and every tile at once, so an admin needs a way
  // to focus. "grouped" (default) matches api/admin/submissions.ts's own
  // default order (tile then team, best for spotting duplicates); "oldest"
  // ignores grouping for clearing a launch-day backlog fastest.
  const [submissionTeamFilter, setSubmissionTeamFilter] = useState<number | null>(null);
  const [submissionTileFilter, setSubmissionTileFilter] = useState<number | null>(null);
  const [submissionSort, setSubmissionSort] = useState<"grouped" | "oldest">("grouped");

  // Which team is "mine" comes from the session, not from the board response:
  // the board is now one cached copy shared by every viewer (see getBoard in
  // api/board.ts), so it can't carry anything per-viewer.
  const myTeamId = user?.team?.id ?? null;

  function reloadBoard(fresh = false) {
    fetchBoard(fresh)
      .then((data) => {
        setBoard(data);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setBoard(PLACEHOLDER_BOARD);
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
    fetchAdminSubmissions("pending", {
      teamId: submissionTeamFilter ?? undefined,
      tileId: submissionTileFilter ?? undefined,
      sort: submissionSort,
    })
      .then(setSubmissions)
      .catch(() =>
        setSubmissions(import.meta.env.DEV ? PLACEHOLDER_SUBMISSIONS : null),
      );
  }

  useEffect(reloadSubmissions, [
    isAdmin,
    view,
    submissionTeamFilter,
    submissionTileFilter,
    submissionSort,
  ]);

  // Options for the review-queue filters, derived from the board already on
  // hand rather than a separate admin/teams or admin/tiles fetch — every
  // team carries the same tile set, so any one team's tiles name them all.
  const submissionTeamOptions = board?.teams ?? [];
  const submissionTileOptions = board?.teams?.[0]?.tiles ?? [];

  async function handleSubmitProof(tileId: number, file: File, itemId?: number) {
    setUploadingTileId(tileId);
    setError(null);
    try {
      await submitTileProof(tileId, file, itemId);
      reloadBoard(true);
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
    setError(null);
    try {
      await reviewSubmission(id, decision, itemId);
      reloadSubmissions();
      reloadBoard(true);
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

  const boardTeamId = pickedTeamId ?? myTeamId;
  const boardTeam =
    board.teams.find((t) => t.id === boardTeamId) ?? board.teams[0] ?? null;
  const selectedTile =
    boardTeam?.tiles.find((t) => t.tileId === selectedTileId) ?? null;
  const canSubmitToBoardTeam = !!boardTeam && boardTeam.id === myTeamId;

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
                    setPickedTeamId(team.id);
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
                  onSubmit={async (file, itemId) => {
                    if (!selectedTile) return;
                    await handleSubmitProof(selectedTile.tileId, file, itemId);
                  }}
                  onOpenLightbox={setLightboxUrl}
                />
              </div>
            </div>
          </>
        )}

        {view === "admin" && isAdmin && (
          <>
            <div className="bingo-admin-filters">
              <select
                className="admin-select"
                value={submissionTeamFilter ?? ""}
                onChange={(e) =>
                  setSubmissionTeamFilter(e.target.value ? Number(e.target.value) : null)
                }
                aria-label="Filter by team"
              >
                <option value="">All teams</option>
                {submissionTeamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                className="admin-select"
                value={submissionTileFilter ?? ""}
                onChange={(e) =>
                  setSubmissionTileFilter(e.target.value ? Number(e.target.value) : null)
                }
                aria-label="Filter by tile"
              >
                <option value="">All tiles</option>
                {submissionTileOptions.map((t) => (
                  <option key={t.tileId} value={t.tileId}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="bingo-admin-sort-toggle">
                <button
                  type="button"
                  className={submissionSort === "grouped" ? "admin-btn-primary" : "admin-btn-ghost"}
                  onClick={() => setSubmissionSort("grouped")}
                >
                  Grouped
                </button>
                <button
                  type="button"
                  className={submissionSort === "oldest" ? "admin-btn-primary" : "admin-btn-ghost"}
                  onClick={() => setSubmissionSort("oldest")}
                >
                  Oldest first
                </button>
              </div>
            </div>
            <AdminReview
              submissions={submissions}
              sort={submissionSort}
              onReview={handleReview}
              onOpenLightbox={setLightboxUrl}
            />
          </>
        )}
      </div>

      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      <SiteFooter />
    </>
  );
}
