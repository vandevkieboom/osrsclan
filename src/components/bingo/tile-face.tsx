import type { BoardTile } from "../../services/board";
import { initialsOf } from "./bingo-helpers";

export function TileFace({
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
  const contributors = Array.from(
    tile.proofs
      .filter((p): p is typeof p & { submittedBy: string } => !!p.submittedBy)
      .reduce((map, p) => {
        if (!map.has(p.submittedBy)) map.set(p.submittedBy, p.submittedByAvatarUrl);
        return map;
      }, new Map<string, string | null>()),
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
      {contributors.length >= 2 && (
        <div className="bingo-tile-avatars">
          {contributors.slice(0, 3).map(([name, avatarUrl]) =>
            avatarUrl ? (
              <img key={name} src={avatarUrl} alt="" className="bingo-tile-avatar" />
            ) : (
              <span key={name} className="bingo-tile-avatar">
                {initialsOf(name)}
              </span>
            ),
          )}
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
