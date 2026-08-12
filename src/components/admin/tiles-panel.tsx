import { useEffect, useState } from "react";
import {
  createTile,
  deleteTile,
  fetchAdminTiles,
  fetchBoardConfig,
  updateTile,
  type AdminTile,
  type BoardConfig,
  type TileGoal,
} from "../../services/admin";
import { PLACEHOLDER_BOARD_CONFIG, PLACEHOLDER_TILES } from "./placeholders";

// Item ids are edited as a free-text comma-separated list ("1234, 5678"),
// which keeps the form as light as the category/description fields next to it.
// Anything that isn't a positive integer is dropped rather than rejected, so a
// trailing comma or stray space while typing doesn't block saving.
function parseItemIdsInput(text: string): number[] {
  return Array.from(
    new Set(
      text
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );
}

const ITEM_IDS_PLACEHOLDER = "Item IDs for auto-detect (e.g. 20997, 21015)";

// Every field this form edits, threaded as one object rather than a long
// positional parameter list (which is how this used to be structured, back
// when there were only 7 fields — the xp/kc goal fields would have made an
// 10-argument callback, so this form switches to a single object instead).
interface TileFormValues {
  name: string;
  iconUrl: string;
  requiredCount: number;
  category: string;
  description: string;
  itemIds: number[];
  requireUniqueItems: boolean;
  goal: TileGoal;
}

function GoalFields({
  goal,
  onChange,
}: {
  goal: TileGoal;
  onChange: (goal: TileGoal) => void;
}) {
  return (
    <div className="admin-tile-goal-row">
      <select
        className="admin-select admin-tile-goal-kind-select"
        value={goal.goalKind}
        onChange={(e) => {
          const goalKind = e.target.value as TileGoal["goalKind"];
          onChange(
            goalKind === "item"
              ? { goalKind, goalKey: "", goalTarget: null }
              : { goalKind, goalKey: goal.goalKey, goalTarget: goal.goalTarget ?? 1 },
          );
        }}
      >
        <option value="item">Item drop</option>
        <option value="xp">Team XP</option>
        <option value="kc">Team kill count</option>
      </select>
      {goal.goalKind !== "item" && (
        <>
          <input
            type="text"
            className="admin-input admin-tile-goal-input"
            placeholder={
              goal.goalKind === "xp" ? "Skill (e.g. Fishing)" : "Boss (e.g. Zulrah)"
            }
            value={goal.goalKey}
            onChange={(e) => onChange({ ...goal, goalKey: e.target.value })}
          />
          <input
            type="number"
            min={1}
            className="admin-input admin-tile-goal-input admin-tile-goal-target-input"
            placeholder={goal.goalKind === "xp" ? "Target XP" : "Target kills"}
            value={goal.goalTarget ?? ""}
            onChange={(e) =>
              onChange({
                ...goal,
                goalTarget: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </>
      )}
    </div>
  );
}

function TileAddRow({
  onSave,
  onCancel,
}: {
  onSave: (values: TileFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [requiredCount, setRequiredCount] = useState(1);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [itemIdsText, setItemIdsText] = useState("");
  const [requireUniqueItems, setRequireUniqueItems] = useState(false);
  const [goal, setGoal] = useState<TileGoal>({
    goalKind: "item",
    goalKey: "",
    goalTarget: null,
  });
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
          onChange={(e) =>
            setRequiredCount(Math.max(1, Number(e.target.value) || 1))
          }
        />
      </div>
      <input
        type="text"
        className="admin-input admin-tile-description-input"
        placeholder="Explain exactly what counts for this tile…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <GoalFields goal={goal} onChange={setGoal} />
      {goal.goalKind === "item" && (
        <input
          type="text"
          className="admin-input admin-tile-description-input"
          placeholder={ITEM_IDS_PLACEHOLDER}
          value={itemIdsText}
          onChange={(e) => setItemIdsText(e.target.value)}
        />
      )}
      {goal.goalKind === "item" && (
        <label className="admin-tile-unique-toggle">
          <input
            type="checkbox"
            checked={requireUniqueItems}
            onChange={(e) => setRequireUniqueItems(e.target.checked)}
          />
          Require unique items (e.g. "4 different DK rings", not the same one 4x)
        </label>
      )}
      <div className="admin-tile-card-actions">
        <button
          type="button"
          className="admin-btn-primary"
          onClick={() =>
            name.trim() &&
            iconUrl.trim() &&
            onSave({
              name: name.trim(),
              iconUrl: iconUrl.trim(),
              requiredCount,
              category: category.trim(),
              description: description.trim(),
              itemIds: parseItemIdsInput(itemIdsText),
              requireUniqueItems,
              goal,
            })
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

function valuesFromTile(tile: AdminTile): TileFormValues {
  return {
    name: tile.name,
    iconUrl: tile.iconUrl,
    requiredCount: tile.requiredCount,
    category: tile.category,
    description: tile.description,
    itemIds: tile.itemIds,
    requireUniqueItems: tile.requireUniqueItems,
    goal: {
      goalKind: tile.goalKind,
      goalKey: tile.goalKey,
      goalTarget: tile.goalTarget,
    },
  };
}

function valuesEqual(a: TileFormValues, b: TileFormValues): boolean {
  return (
    a.name === b.name &&
    a.iconUrl === b.iconUrl &&
    a.requiredCount === b.requiredCount &&
    a.category === b.category &&
    a.description === b.description &&
    a.itemIds.join(",") === b.itemIds.join(",") &&
    a.requireUniqueItems === b.requireUniqueItems &&
    a.goal.goalKind === b.goal.goalKind &&
    a.goal.goalKey === b.goal.goalKey &&
    a.goal.goalTarget === b.goal.goalTarget
  );
}

function TileRow({
  tile,
  onSave,
  onDelete,
}: {
  tile: AdminTile;
  onSave: (values: TileFormValues) => void;
  onDelete: () => void;
}) {
  const [values, setValues] = useState(valuesFromTile(tile));
  const [itemIdsText, setItemIdsText] = useState(tile.itemIds.join(", "));
  const [prevTile, setPrevTile] = useState(tile);
  // Compared by field value, not by reference: `tile` is a fresh object after
  // every reload() regardless of whether this particular tile's data actually
  // changed, and resetting on reference alone would wipe an in-progress edit
  // in this row whenever any other row's save triggers a reload.
  if (!valuesEqual(valuesFromTile(tile), valuesFromTile(prevTile))) {
    setPrevTile(tile);
    setValues(valuesFromTile(tile));
    setItemIdsText(tile.itemIds.join(", "));
  }

  function commit(next: TileFormValues) {
    if (
      next.name &&
      next.iconUrl &&
      !valuesEqual(next, valuesFromTile(tile))
    ) {
      onSave(next);
    } else {
      setValues(valuesFromTile(tile));
      setItemIdsText(tile.itemIds.join(", "));
    }
  }

  function commitCurrent() {
    commit({
      ...values,
      name: values.name.trim() || tile.name,
      iconUrl: values.iconUrl.trim() || tile.iconUrl,
      requiredCount: Math.max(1, Math.floor(values.requiredCount) || 1),
      category: values.category.trim(),
      description: values.description.trim(),
      itemIds: parseItemIdsInput(itemIdsText),
    });
  }

  return (
    <div className="admin-row admin-tile-card">
      <div className="admin-tile-card-top">
        <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
        <input
          type="text"
          className="admin-input admin-row-input"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          onBlur={commitCurrent}
        />
        <input
          type="text"
          className="admin-input admin-tile-icon-input"
          value={values.iconUrl}
          onChange={(e) => setValues({ ...values, iconUrl: e.target.value })}
          onBlur={commitCurrent}
        />
        <input
          type="text"
          className="admin-input admin-tile-category-input"
          placeholder="Category"
          value={values.category}
          onChange={(e) => setValues({ ...values, category: e.target.value })}
          onBlur={commitCurrent}
        />
        <input
          type="number"
          min={1}
          className="admin-input admin-tile-count-input"
          value={values.requiredCount}
          onChange={(e) =>
            setValues({
              ...values,
              requiredCount: Math.max(1, Number(e.target.value) || 1),
            })
          }
          onBlur={commitCurrent}
        />
        <button type="button" className="admin-btn-danger" onClick={onDelete}>
          ✕
        </button>
      </div>
      <input
        type="text"
        className="admin-input admin-tile-description-input"
        placeholder="Explain exactly what counts for this tile…"
        value={values.description}
        onChange={(e) => setValues({ ...values, description: e.target.value })}
        onBlur={commitCurrent}
      />
      <GoalFields
        goal={values.goal}
        onChange={(goal) => commit({ ...values, goal })}
      />
      {values.goal.goalKind === "item" && (
        <input
          type="text"
          className="admin-input admin-tile-description-input"
          placeholder={ITEM_IDS_PLACEHOLDER}
          value={itemIdsText}
          onChange={(e) => setItemIdsText(e.target.value)}
          onBlur={commitCurrent}
        />
      )}
      {values.goal.goalKind === "item" && (
        <label className="admin-tile-unique-toggle">
          <input
            type="checkbox"
            checked={values.requireUniqueItems}
            onChange={(e) =>
              // Not text input + onBlur here, so commit explicitly on change.
              commit({ ...values, requireUniqueItems: e.target.checked })
            }
          />
          Require unique items (e.g. "4 different DK rings", not the same one 4x)
        </label>
      )}
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

  async function handleAddTile(position: number, values: TileFormValues) {
    try {
      await createTile({ position, ...values });
      setAddingPosition(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tile");
    }
  }

  async function handleSaveTile(id: number, values: TileFormValues) {
    try {
      await updateTile({ id, ...values });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tile");
    }
  }

  async function handleDeleteTile(id: number) {
    if (
      !window.confirm(
        "Delete this tile? Any submissions for it will be removed too.",
      )
    )
      return;
    try {
      await deleteTile(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tile");
    }
  }

  if (!config || !tiles)
    return <div className="admin-panel">{error ?? "Loading..."}</div>;

  const slotCount = config.size * config.size;
  const tileByPosition = new Map(tiles.map((t) => [t.position, t]));
  const overflowTiles = tiles.filter((t) => t.position >= slotCount);
  const firstEmptyPosition = Array.from(
    { length: slotCount },
    (_, i) => i,
  ).find((i) => !tileByPosition.has(i));

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
              onSave={(values) => handleSaveTile(tile.id, values)}
              onDelete={() => handleDeleteTile(tile.id)}
            />
          ))}
        {addingPosition !== null && (
          <TileAddRow
            onSave={(values) => handleAddTile(addingPosition, values)}
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
            Outside the current {config.size} × {config.size} board (from a
            larger size before) — hidden from the live board until you grow the
            size again.
          </p>
          <div className="admin-row-list">
            {overflowTiles.map((tile) => (
              <div key={tile.id} className="admin-row">
                <img src={tile.iconUrl} alt="" className="admin-tile-thumb" />
                <span className="admin-row-name">{tile.name}</span>
                <button
                  type="button"
                  className="admin-btn-danger"
                  onClick={() => handleDeleteTile(tile.id)}
                >
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
