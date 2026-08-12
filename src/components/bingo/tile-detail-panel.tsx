import { useEffect, useState } from "react";
import type { BoardTile } from "../../services/board";
import { initialsOf } from "./bingo-helpers";

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
  onSubmit: (file: File) => Promise<void>;
  onOpenLightbox: (url: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // A newly selected tile shouldn't carry over the previous tile's pending
  // (unsubmitted) screenshot choice.
  useEffect(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
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

  const pct =
    tile.requiredCount > 1
      ? Math.min(
          100,
          Math.round((tile.approvedCount / tile.requiredCount) * 100),
        )
      : 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit() {
    if (!selectedFile) return;
    try {
      await onSubmit(selectedFile);
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch {
      // The parent already surfaces the error — keep the selection so the
      // user can retry without re-picking the file.
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

      {tile.requiredCount > 1 && (
        <>
          <div className="bingo-detail-progress-label">
            {tile.approvedCount} / {tile.requiredCount} contributed toward this
            tile
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

      {canSubmit ? (
        <div className="bingo-detail-submit">
          <div className="bingo-detail-section-label">SUBMIT PROOF</div>
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
              tile.approvedCount >= tile.requiredCount
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
