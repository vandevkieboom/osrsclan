import { useEffect, useState } from "react";
import type { BoardTile } from "../../services/board";
import { initialsOf } from "./bingo-helpers";
import { ItemRequirementsProgress } from "./item-requirements-progress";

export function TileDetailPanel({
  tile,
  accentColor,
  canSubmit,
  isLoggedIn,
  viewingTeamName,
  isUploading,
  onSubmit,
  onOpenLightbox,
}: {
  tile: BoardTile | null;
  accentColor: string;
  canSubmit: boolean;
  isLoggedIn: boolean;
  viewingTeamName: string;
  isUploading: boolean;
  onSubmit: (file: File, itemId?: number) => Promise<void>;
  onOpenLightbox: (url: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Which item this screenshot shows — only asked for on a tile using
  // item_requirements (AND/OR item conditions; see db/schema.sql). Every
  // other item tile submits exactly as before, with no item to pick.
  const [selectedItemId, setSelectedItemId] = useState("");

  // A newly selected tile shouldn't carry over the previous tile's pending
  // (unsubmitted) screenshot choice.
  useEffect(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSelectedItemId("");
  }, [tile?.tileId]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!tile) {
    return (
      <div className="bingo-detail-card bingo-detail-card--empty">
        Click any tile to see what it needs, who's contributed, and to submit
        proof.
      </div>
    );
  }

  const isItemGoal = tile.goalKind === "item";
  const pct = isItemGoal
    ? tile.requiredCount > 1
      ? Math.min(
          100,
          Math.round((tile.approvedCount / tile.requiredCount) * 100),
        )
      : 0
    : tile.goalTarget
      ? Math.min(100, Math.round(((tile.teamProgress ?? 0) / tile.goalTarget) * 100))
      : 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  const needsItemPick = !!tile?.itemRequirementsStatus;

  async function handleSubmit() {
    if (!selectedFile) return;
    if (needsItemPick && !selectedItemId) return;
    try {
      await onSubmit(
        selectedFile,
        selectedItemId ? Number(selectedItemId) : undefined,
      );
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectedItemId("");
    } catch {
      // The parent already surfaces the error — keep the selection so the
      // user can retry without re-picking the file/item.
    }
  }

  return (
    <div className="bingo-detail-card">
      <div className="bingo-detail-name">{tile.name}</div>
      {tile.category && (
        <div className="bingo-detail-category">{tile.category}</div>
      )}
      {tile.description && (
        <div className="bingo-detail-description">{tile.description}</div>
      )}

      {isItemGoal && tile.itemRequirementsStatus ? (
        // A tile using item_requirements (AND/OR item conditions — see
        // db/schema.sql) decides completeness per-group, not by counting
        // approved submissions against the tile's flat requiredCount — that
        // field is a leftover from before advanced requirements existed on
        // this tile and no longer means anything once they're set, so the
        // flat "X / Y contributed" bar below would show a number with no
        // relationship to what actually completes the tile.
        <>
          <div className="bingo-detail-section-label">Requirements</div>
          <ItemRequirementsProgress status={tile.itemRequirementsStatus} />
        </>
      ) : (
        isItemGoal &&
        tile.requiredCount > 1 && (
          <>
            <div className="bingo-detail-progress-label">
              {tile.approvedCount} / {tile.requiredCount} contributed toward
              this tile
            </div>
            <div className="bingo-detail-progress-track">
              <div
                className="bingo-detail-progress-fill"
                style={{ width: `${pct}%`, background: accentColor }}
              />
            </div>
          </>
        )
      )}

      {!isItemGoal && (
        <>
          <div className="bingo-detail-progress-label">
            {(tile.teamProgress ?? 0).toLocaleString()} /{" "}
            {(tile.goalTarget ?? 0).toLocaleString()}{" "}
            {tile.goalKind === "xp" ? "combined XP" : "combined kills"} — team
            total, tracked automatically by everyone's plugin
          </div>
          <div className="bingo-detail-progress-track">
            <div
              className="bingo-detail-progress-fill"
              style={{ width: `${pct}%`, background: accentColor }}
            />
          </div>
        </>
      )}

      {isItemGoal && (
        <>
          <div className="bingo-detail-section-label">Contributors</div>
          {tile.proofs.length > 0 ? (
            <div className="bingo-detail-contributors">
              {tile.proofs.map((p) => (
                <div key={p.id} className="bingo-detail-contributor">
                  {p.submittedByAvatarUrl ? (
                    <img
                      src={p.submittedByAvatarUrl}
                      alt=""
                      className="bingo-detail-contributor-avatar"
                    />
                  ) : (
                    <span className="bingo-detail-contributor-avatar">
                      {initialsOf(p.submittedBy ?? "?")}
                    </span>
                  )}
                  <div className="bingo-detail-contributor-info">
                    <div className="bingo-detail-contributor-name">
                      {p.submittedBy ?? "Unknown"}
                    </div>
                    <div className="bingo-detail-contributor-ts">
                      {new Date(p.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`bingo-proof-pill bingo-proof-pill--${p.status}`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty">No submissions yet.</div>
          )}

          {tile.proofs.length > 0 && (
            <>
              <div className="bingo-detail-section-label">
                Screenshots ({tile.proofs.length})
              </div>
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
        </>
      )}

      {!isItemGoal ? (
        <div className="bingo-detail-readonly-note">
          No proof needed — everyone on the team with the RuneLite plugin
          installed contributes to this total automatically.
        </div>
      ) : canSubmit ? (
        <div className="bingo-detail-submit">
          <div className="bingo-detail-section-label">SUBMIT PROOF</div>
          {needsItemPick && (
            <select
              className="bingo-detail-item-select"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              aria-label="Which item does this screenshot show?"
            >
              <option value="">Which item does this show? *</option>
              {tile.itemRequirementsStatus!.perItem.map((i) => (
                <option key={i.itemId} value={i.itemId}>
                  {i.name} ({i.currentAmount}/{i.requiredAmount})
                </option>
              ))}
            </select>
          )}
          <label className="bingo-detail-dropzone">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="bingo-detail-dropzone-input"
              onChange={handleFileChange}
            />
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="bingo-detail-dropzone-preview"
              />
            ) : (
              <span className="bingo-detail-dropzone-empty">
                📷 Click to choose a screenshot
              </span>
            )}
          </label>
          <button
            type="button"
            className="bingo-detail-submit-btn"
            onClick={handleSubmit}
            disabled={
              !selectedFile ||
              isUploading ||
              (needsItemPick && !selectedItemId) ||
              tile.status === "approved"
            }
          >
            {isUploading ? "Uploading…" : "SUBMIT FOR REVIEW"}
          </button>
        </div>
      ) : (
        <div className="bingo-detail-readonly-note">
          {isLoggedIn ? (
            <>
              You're viewing {viewingTeamName}'s board. Switch to your own team
              above to submit proof.
            </>
          ) : (
            <>
              You're viewing {viewingTeamName}'s board. Log in with Discord to
              submit proof.
            </>
          )}
        </div>
      )}
    </div>
  );
}
