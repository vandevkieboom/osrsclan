import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { useAuth } from "../context/auth-context";
import {
  fetchBoard,
  submitTileProof,
  type BoardData,
  type BoardTeam,
  type BoardTile,
} from "../services/board";
import {
  fetchAdminSubmissions,
  reviewSubmission,
  type AdminSubmission,
} from "../services/admin";

type View = "leaderboard" | "board" | "draft" | "admin";

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
function placeholderTiles(teamId: number): BoardTile[] {
  return Array.from({ length: 25 }, (_, i) => {
    const status = PLACEHOLDER_STATUSES[(i + teamId) % PLACEHOLDER_STATUSES.length];
    return {
      tileId: i,
      name: `Tile ${i + 1}`,
      iconUrl: PLACEHOLDER_ICON,
      requiredCount: i % 5 === 0 ? 3 : 1,
      category: "ITEM DROP",
      description: "Submit a screenshot once you've received this item.",
      approvedCount: status === "approved" ? 1 : 0,
      pendingCount: status === "pending" ? 1 : 0,
      rejectedCount: status === "rejected" ? 1 : 0,
      status,
      latestProofUrl: null,
      latestSubmittedBy: status === "none" ? null : "izJordy",
      proofs:
        status === "none"
          ? []
          : [
              {
                id: i,
                status: status === "rejected" ? "rejected" : status === "pending" ? "pending" : "approved",
                proofUrl: PLACEHOLDER_ICON,
                submittedBy: "izJordy",
                createdAt: "2026-08-02T00:00:00.000Z",
              },
            ],
    };
  });
}
const PLACEHOLDER_BOARD: BoardData = {
  config: {
    name: "Summer Blackout Bingo",
    dateRange: "Aug 2 – Aug 16, 2026",
    size: 5,
    prizePot: {
      total: "51.50M",
      buyIn: "1.50M",
      donated: "50.00M",
      entries: [
        { name: "Crimson Fang", amount: "500.00K" },
        { name: "Onyx Talon", amount: "500.00K" },
        { name: "Coffer donation", amount: "50.00M" },
      ],
    },
  },
  teams: [
    {
      id: 1,
      name: "Crimson Fang",
      memberCount: 6,
      members: ["izJordy", "AtomicKilo", "BreauxChacho", "BHops", "Lamboat", "YoonA"],
      captainId: 1,
      captainName: "izJordy",
      completeCount: 18,
      totalTiles: 25,
      pct: 72,
      accentColor: "#e8574a",
      isLeading: true,
      tiles: placeholderTiles(1),
    },
    {
      id: 2,
      name: "Onyx Talon",
      memberCount: 5,
      members: ["Indaco", "Treecio", "AnotherPlayer", "SomePlayer", "Solo Nostalg"],
      captainId: null,
      captainName: null,
      completeCount: 9,
      totalTiles: 25,
      pct: 36,
      accentColor: "#c9c9c9",
      isLeading: false,
      tiles: placeholderTiles(2),
    },
    {
      id: 3,
      name: "Zenyte Vanguard",
      memberCount: 7,
      members: ["ABearCat", "Helesta", "Wafas", "Eskett", "Mevvz", "Player7", "Player8"],
      captainId: null,
      captainName: null,
      completeCount: 14,
      totalTiles: 25,
      pct: 56,
      accentColor: "#ffb340",
      isLeading: false,
      tiles: placeholderTiles(3),
    },
  ],
  myTeamId: 1,
  draft: { active: false, order: [], pickIndex: 0, log: [] },
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

function initialsOf(name: string): string {
  return name.charAt(0).toUpperCase();
}

function TeamCard({ team }: { team: BoardTeam }) {
  return (
    <div
      className="bingo-team-card"
      style={{ "--team-accent": team.accentColor } as React.CSSProperties}
    >
      {team.isLeading && <div className="bingo-team-leading-badge">LEADING</div>}
      <div className="bingo-team-name">{team.name}</div>
      <div className="bingo-team-members">
        {team.memberCount} members
        {team.captainName ? ` · captain ${team.captainName}` : ""}
      </div>
      <div className="bingo-team-progress-track">
        <div className="bingo-team-progress-fill" style={{ width: `${team.pct}%` }} />
      </div>
      <div className="bingo-team-count">
        {team.completeCount} / {team.totalTiles} tiles complete
      </div>
    </div>
  );
}

function TileFace({
  tile,
  isSelected,
  isUploading,
  onClick,
}: {
  tile: BoardTile;
  isSelected: boolean;
  isUploading: boolean;
  onClick: () => void;
}) {
  const contributorNames = Array.from(
    new Set(tile.proofs.map((p) => p.submittedBy).filter((n): n is string => !!n)),
  );

  return (
    <button
      type="button"
      className={`bingo-tile bingo-tile--${tile.status}${isSelected ? " bingo-tile--selected" : ""}`}
      onClick={onClick}
      title={tile.name}
    >
      {tile.status === "approved" && (
        <span className="bingo-tile-status bingo-tile-status--approved">✓</span>
      )}
      {tile.status === "pending" && (
        <span className="bingo-tile-status bingo-tile-status--pending">⏳</span>
      )}
      <img src={tile.iconUrl} alt="" className="bingo-tile-icon" />
      {contributorNames.length >= 2 && (
        <div className="bingo-tile-avatars">
          {contributorNames.slice(0, 3).map((name, i) => (
            <span key={i} className="bingo-tile-avatar">
              {initialsOf(name)}
            </span>
          ))}
        </div>
      )}
      {tile.requiredCount > 1 && tile.status !== "approved" && (
        <span className="bingo-tile-fraction">
          {tile.approvedCount}/{tile.requiredCount}
        </span>
      )}
      {isUploading && <span className="bingo-tile-uploading">Uploading…</span>}
    </button>
  );
}

function TileDetailPanel({
  tile,
  accentColor,
  canSubmit,
  viewingTeamName,
  isUploading,
  onSubmitClick,
  onOpenLightbox,
}: {
  tile: BoardTile | null;
  accentColor: string;
  canSubmit: boolean;
  viewingTeamName: string;
  isUploading: boolean;
  onSubmitClick: () => void;
  onOpenLightbox: (url: string) => void;
}) {
  if (!tile) {
    return (
      <div className="bingo-detail-card bingo-detail-card--empty">
        Click any tile to see what it needs, who's contributed, and to submit proof.
      </div>
    );
  }

  const pct = tile.requiredCount > 1 ? Math.min(100, Math.round((tile.approvedCount / tile.requiredCount) * 100)) : 0;

  return (
    <div className="bingo-detail-card">
      <div className="bingo-detail-name">{tile.name}</div>
      {tile.category && <div className="bingo-detail-category">{tile.category}</div>}
      {tile.description && <div className="bingo-detail-description">{tile.description}</div>}

      {tile.requiredCount > 1 && (
        <>
          <div className="bingo-detail-progress-label">
            {tile.approvedCount} / {tile.requiredCount} contributed toward this tile
          </div>
          <div className="bingo-detail-progress-track">
            <div
              className="bingo-detail-progress-fill"
              style={{ width: `${pct}%`, background: accentColor }}
            />
          </div>
        </>
      )}

      <div className="bingo-detail-section-label">Contributors</div>
      {tile.proofs.length > 0 ? (
        <div className="bingo-detail-contributors">
          {tile.proofs.map((p) => (
            <div key={p.id} className="bingo-detail-contributor">
              <span className="bingo-detail-contributor-avatar">
                {initialsOf(p.submittedBy ?? "?")}
              </span>
              <div className="bingo-detail-contributor-info">
                <div className="bingo-detail-contributor-name">{p.submittedBy ?? "Unknown"}</div>
                <div className="bingo-detail-contributor-ts">
                  {new Date(p.createdAt).toLocaleString()}
                </div>
              </div>
              <span className={`bingo-proof-pill bingo-proof-pill--${p.status}`}>{p.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-empty">No submissions yet.</div>
      )}

      {tile.proofs.length > 0 && (
        <>
          <div className="bingo-detail-section-label">Screenshots ({tile.proofs.length})</div>
          <div className="bingo-detail-screenshots">
            {tile.proofs.map((p) => (
              <img
                key={p.id}
                src={p.proofUrl}
                alt=""
                className="bingo-detail-thumb"
                onClick={() => onOpenLightbox(p.proofUrl)}
              />
            ))}
          </div>
        </>
      )}

      {canSubmit ? (
        <div className="bingo-detail-submit">
          <div className="bingo-detail-section-label">Submit proof</div>
          <button
            type="button"
            className="admin-btn-primary bingo-detail-submit-btn"
            onClick={onSubmitClick}
            disabled={isUploading || tile.approvedCount >= tile.requiredCount}
          >
            {isUploading ? "Uploading…" : "Choose a screenshot"}
          </button>
        </div>
      ) : (
        <div className="bingo-detail-readonly-note">
          You're viewing {viewingTeamName}'s board. Switch to your own team above to submit proof.
        </div>
      )}
    </div>
  );
}

function PrizePotCard({ prizePot }: { prizePot: BoardData["config"]["prizePot"] }) {
  return (
    <div className="bingo-detail-card">
      <div className="profile-card-title profile-card-title--sm">Prize Pot</div>
      <div className="bingo-prizepot-total">{prizePot.total} GP</div>
      <div className="bingo-prizepot-breakdown">
        {prizePot.buyIn} in buy-ins · {prizePot.donated} donated
      </div>
      <div className="bingo-prizepot-entries">
        {prizePot.entries.map((e, i) => (
          <div key={i} className="bingo-prizepot-entry">
            <span>{e.name}</span>
            <span className="bingo-prizepot-amount">{e.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="bingo-lightbox-backdrop" onClick={onClose}>
      <img src={url} alt="" className="bingo-lightbox-img" />
    </div>
  );
}

export function BingoPage() {
  const { user, isAdmin, login } = useAuth();
  const [view, setView] = useState<View>("leaderboard");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingTileId, setUploadingTileId] = useState<number | null>(null);
  const [boardTeamId, setBoardTeamId] = useState<number | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[] | null>(null);
  const pendingTileId = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reloadBoard() {
    fetchBoard()
      .then((data) => {
        setBoard(data);
        setBoardTeamId((prev) => prev ?? data.myTeamId ?? data.teams[0]?.id ?? null);
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
  // Admin Panel tab mutates teams/members/tiles/draft state, so switching
  // back to Leaderboard/Board/Draft needs a fresh fetch to see it.
  useEffect(reloadBoard, [view]);

  function reloadSubmissions() {
    if (!isAdmin) {
      Promise.resolve(null).then(setSubmissions);
      return;
    }
    fetchAdminSubmissions("pending")
      .then(setSubmissions)
      .catch(() => setSubmissions(import.meta.env.DEV ? PLACEHOLDER_SUBMISSIONS : null));
  }

  useEffect(reloadSubmissions, [isAdmin, view]);

  function handleSubmitClick(tileId: number) {
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
            <div className="page-eyebrow">Clan Event</div>
            <h1 className="page-title">Bingo</h1>
            <p className="page-sub">There was a problem loading the bingo board.</p>
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

  const boardTeam = board.teams.find((t) => t.id === boardTeamId) ?? board.teams[0] ?? null;
  const selectedTile = boardTeam?.tiles.find((t) => t.tileId === selectedTileId) ?? null;
  const canSubmitToBoardTeam = !!boardTeam && boardTeam.id === board.myTeamId;

  const onTheClockTeam = board.draft.active
    ? board.teams.find((t) => t.id === board.draft.order[board.draft.pickIndex])
    : undefined;

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
                First team to complete every tile on their board wins. Click a tile to see exactly
                what it needs, who's contributed, and to submit proof.
              </p>
            </div>
            {board.config.dateRange && <div className="bingo-date-range">{board.config.dateRange}</div>}
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
          <button
            type="button"
            className={`bingo-tab${view === "draft" ? " active" : ""}`}
            onClick={() => setView("draft")}
          >
            DRAFT
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

        {view === "board" && !boardTeam && (
          <div className="bingo-admin-empty">No teams have been created yet.</div>
        )}

        {view === "board" && boardTeam && (
          <>
            <div className="bingo-board-head">
              <div>
                <div className="bingo-board-title">{boardTeam.name}'s Board</div>
                <div className="bingo-board-count">{board.config.dateRange}</div>
              </div>
              <div className="bingo-board-head-stat">
                <div className="bingo-board-head-track">
                  <div
                    className="bingo-board-head-fill"
                    style={{ width: `${boardTeam.pct}%`, background: boardTeam.accentColor }}
                  />
                </div>
                <div className="bingo-board-head-count" style={{ color: boardTeam.accentColor }}>
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
                  <span className="bingo-team-pill-dot" style={{ background: team.accentColor }} />
                  {team.name}
                </button>
              ))}
            </div>

            {!user && (
              <div className="bingo-login-prompt">
                <button type="button" className="site-header-login" onClick={() => login()}>
                  Log in with Discord to submit proof
                </button>
              </div>
            )}

            <div className="bingo-board-layout">
              <div
                className="bingo-tiles-grid"
                style={{ gridTemplateColumns: `repeat(${board.config.size}, 1fr)` }}
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
                  viewingTeamName={boardTeam.name}
                  isUploading={uploadingTileId === selectedTile?.tileId}
                  onSubmitClick={() => selectedTile && handleSubmitClick(selectedTile.tileId)}
                  onOpenLightbox={setLightboxUrl}
                />
                <PrizePotCard prizePot={board.config.prizePot} />
              </div>
            </div>
          </>
        )}

        {view === "draft" && (
          <div className="bingo-draft">
            {!board.draft.active && board.draft.log.length === 0 && (
              <div className="bingo-admin-empty">
                The draft hasn't started yet. Check back once the officers kick things off.
              </div>
            )}
            {board.draft.active && onTheClockTeam && (
              <div
                className="bingo-draft-clock"
                style={{ borderColor: onTheClockTeam.accentColor }}
              >
                <div className="bingo-draft-clock-label">
                  ON THE CLOCK — PICK {board.draft.pickIndex + 1} OF {board.draft.order.length}
                </div>
                <div className="bingo-draft-clock-team" style={{ color: onTheClockTeam.accentColor }}>
                  {onTheClockTeam.name}
                </div>
                <div className="bingo-draft-clock-captain">
                  Captain: {onTheClockTeam.captainName ?? "—"}
                </div>
              </div>
            )}
            {!board.draft.active && board.draft.log.length > 0 && (
              <div className="bingo-draft-complete">Draft complete — rosters are final.</div>
            )}

            {board.draft.log.length > 0 && (
              <>
                <div className="bingo-detail-section-label">Pick log</div>
                <div className="bingo-draft-log">
                  {[...board.draft.log]
                    .reverse()
                    .map((entry) => {
                      const team = board.teams.find((t) => t.id === entry.teamId);
                      return (
                        <div key={entry.pickNumber} className="bingo-draft-log-row">
                          <span className="bingo-draft-log-num">#{entry.pickNumber}</span>
                          <span
                            className="bingo-team-pill-dot"
                            style={{ background: team?.accentColor ?? "#8f7a78" }}
                          />
                          <span className="bingo-draft-log-team">{team?.name ?? "—"}</span>
                          <span className="bingo-draft-log-member">{entry.memberName}</span>
                        </div>
                      );
                    })}
                </div>
              </>
            )}

            <div className="bingo-detail-section-label">Rosters</div>
            <div className="bingo-draft-rosters">
              {board.teams.map((team) => (
                <div
                  key={team.id}
                  className="bingo-draft-roster-card"
                  style={{ borderTopColor: team.accentColor }}
                >
                  <div className="bingo-draft-roster-name" style={{ color: team.accentColor }}>
                    {team.name}
                  </div>
                  <div className="bingo-draft-roster-captain">Captain: {team.captainName ?? "—"}</div>
                  {team.members.length > 0 ? (
                    team.members.map((m, i) => (
                      <div key={i} className="bingo-draft-roster-member">
                        {m}
                      </div>
                    ))
                  ) : (
                    <div className="bingo-draft-roster-empty">No players yet.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
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
                  <a href={sub.proofUrl} target="_blank" rel="noreferrer" className="bingo-admin-proof-link">
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
      </div>

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      <SiteFooter />
    </>
  );
}
