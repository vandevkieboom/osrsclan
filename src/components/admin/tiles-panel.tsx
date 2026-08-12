import { useEffect, useState } from "react";
import {
  createTile,
  deleteTile,
  fetchAdminTiles,
  fetchBoardConfig,
  updateTile,
  type AdminTile,
  type BoardConfig,
} from "../../services/admin";
import { PLACEHOLDER_BOARD_CONFIG, PLACEHOLDER_TILES } from "./placeholders";

function TileAddRow({
  onSave,
  onCancel,
}: {
  onSave: (name: string, iconUrl: string, requiredCount: number, category: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [requiredCount, setRequiredCount] = useState(1);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="admin-row admin-tile-row--adding admin-tile-card">
      <div className="admin-tile-card-top">
        <input
          type="text"
          className="admin-input admin-row-input"
          placeholder="Tile name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          type="text"
          className="admin-input admin-tile-icon-input"
          placeholder="Icon image URL"
          value={iconUrl}
          onChange={(e) => setIconUrl(e.target.value)}
        />
        <input
          type="text"
          className="admin-input admin-tile-category-input"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input
          type="number"
          min={1}
          className="admin-input admin-tile-count-input"
          placeholder="Proofs"
          value={requiredCount}
          onChange={(e) => setRequiredCount(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>
      <input
        type="text"
        className="admin-input admin-tile-description-input"
        placeholder="Explain exactly what counts for this tile…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="admin-tile-card-actions">
        <button
          type="button"
          className="admin-btn-primary"
          onClick={() =>
            name.trim() &&
            iconUrl.trim() &&
            onSave(name.trim(), iconUrl.trim(), requiredCount, category.trim(), description.trim())
          }
        >
          Save
        </button>
        <button type="button" className="admin-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TileRow({
  tile,
  onSave,
  onDelete,
}: {
  tile: AdminTile;
  onSave: (name: string, iconUrl: string, requiredCount: number, category: string, description: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(tile.name);
  const [iconUrl, setIconUrl] = useState(tile.iconUrl);
  const [requiredCount, setRequiredCount] = useState(tile.requiredCount);
  const [category, setCategory] = useState(tile.category);
  const [description, setDescription] = useState(tile.description);
  const [prevTile, setPrevTile] = useState(tile);
  if (
    tile.name !== prevTile.name ||
    tile.iconUrl !== prevTile.iconUrl ||
    tile.requiredCount !== prevTile.requiredCount ||
    tile.category !== prevTile.category ||
    tile.description !== prevTile.description
  ) {
    setPrevTile(tile);
    setName(tile.name);
    setIconUrl(tile.iconUrl);
    setRequiredCount(tile.requiredCount);
    setCategory(tile.category);
    setDescription(tile.description);
  }

  function commit() {
    const n = name.trim();
    const u = iconUrl.trim();
    const c = Math.max(1, Math.floor(requiredCount) || 1);
    const cat = category.trim();
    const desc = description.trim();
    if (
      n &&
      u &&
      (n !== tile.name || u !== tile.iconUrl || c !== tile.requiredCount || cat !== tile.category || desc !== tile.description)
    ) {
      onSave(n, u, c, cat, desc);
    } else {
      setName(tile.name);
      setIconUrl(tile.iconUrl);
      setRequiredCount(tile.requiredCount);
      setCategory(tile.category);
      setDescription(tile.description);
    }
  }

  return (
    <div className="admin-row admin-tile-card">
      <div className="admin-tile-card-top">
        <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
        <input
          type="text"
          className="admin-input admin-row-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
        />
        <input
          type="text"
          className="admin-input admin-tile-icon-input"
          value={iconUrl}
          onChange={(e) => setIconUrl(e.target.value)}
          onBlur={commit}
        />
        <input
          type="text"
          className="admin-input admin-tile-category-input"
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={commit}
        />
        <input
          type="number"
          min={1}
          className="admin-input admin-tile-count-input"
          value={requiredCount}
          onChange={(e) => setRequiredCount(Math.max(1, Number(e.target.value) || 1))}
          onBlur={commit}
        />
        <button type="button" className="admin-btn-danger" onClick={onDelete}>
          ✕
        </button>
      </div>
      <input
        type="text"
        className="admin-input admin-tile-description-input"
        placeholder="Explain exactly what counts for this tile…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

export function TilesPanel() {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tiles, setTiles] = useState<AdminTile[] | null>(null);
  const [addingPosition, setAddingPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([fetchBoardConfig(), fetchAdminTiles()])
      .then(([c, t]) => {
        setConfig(c);
        setTiles(t);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setConfig(PLACEHOLDER_BOARD_CONFIG);
          setTiles(PLACEHOLDER_TILES);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load tiles");
      });
  }

  useEffect(reload, []);

  async function handleAddTile(
    position: number,
    name: string,
    iconUrl: string,
    requiredCount: number,
    category: string,
    description: string,
  ) {
    try {
      await createTile(position, name, iconUrl, requiredCount, category, description);
      setAddingPosition(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tile");
    }
  }

  async function handleSaveTile(
    id: number,
    name: string,
    iconUrl: string,
    requiredCount: number,
    category: string,
    description: string,
  ) {
    try {
      await updateTile(id, name, iconUrl, requiredCount, category, description);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tile");
    }
  }

  async function handleDeleteTile(id: number) {
    if (!window.confirm("Delete this tile? Any submissions for it will be removed too.")) return;
    try {
      await deleteTile(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tile");
    }
  }

  if (!config || !tiles) return <div className="admin-panel">{error ?? "Loading..."}</div>;

  const slotCount = config.size * config.size;
  const tileByPosition = new Map(tiles.map((t) => [t.position, t]));
  const overflowTiles = tiles.filter((t) => t.position >= slotCount);
  const firstEmptyPosition = Array.from({ length: slotCount }, (_, i) => i).find(
    (i) => !tileByPosition.has(i),
  );

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-row-list admin-tile-list">
        {tiles
          .filter((t) => t.position < slotCount)
          .sort((a, b) => a.position - b.position)
          .map((tile) => (
            <TileRow
              key={tile.position}
              tile={tile}
              onSave={(name, iconUrl, requiredCount, category, description) =>
                handleSaveTile(tile.id, name, iconUrl, requiredCount, category, description)
              }
              onDelete={() => handleDeleteTile(tile.id)}
            />
          ))}
        {addingPosition !== null && (
          <TileAddRow
            onSave={(name, iconUrl, requiredCount, category, description) =>
              handleAddTile(addingPosition, name, iconUrl, requiredCount, category, description)
            }
            onCancel={() => setAddingPosition(null)}
          />
        )}
      </div>
      {addingPosition === null && firstEmptyPosition !== undefined && (
        <button
          type="button"
          className="admin-tile-list-add"
          onClick={() => setAddingPosition(firstEmptyPosition)}
        >
          + Add Tile
        </button>
      )}

      {overflowTiles.length > 0 && (
        <>
          <p className="page-sub admin-tiles-heading">
            Outside the current {config.size} × {config.size} board (from a larger size before) —
            hidden from the live board until you grow the size again.
          </p>
          <div className="admin-row-list">
            {overflowTiles.map((tile) => (
              <div key={tile.id} className="admin-row">
                <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
                <span className="admin-row-name">{tile.name}</span>
                <button type="button" className="admin-btn-danger" onClick={() => handleDeleteTile(tile.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
