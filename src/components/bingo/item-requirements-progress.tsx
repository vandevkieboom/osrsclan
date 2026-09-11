import { itemIconUrl, type ItemRequirementsStatus } from "../../services/board";

/** "Set A: Enhanced crystal weapon seed 0/1, ..." — the per-group/per-item
 * breakdown for an item_requirements tile (see db/schema.sql), so a viewer
 * can see at a glance which "OR" set is closest to done without re-deriving
 * it from raw counts. Shared between the admin review queue and the
 * player-facing tile detail panel — a tile using item_requirements decides
 * completeness per-group rather than by a flat approved count, so both
 * surfaces need the same breakdown rather than the flat count/target bar
 * that still applies to every other tile type. */
export function ItemRequirementsProgress({
  status,
}: {
  status: ItemRequirementsStatus;
}) {
  const ungrouped = status.perItem.filter((i) => !i.group);
  // Keyed lowercase to match evaluateItemRequirements' own case-insensitive
  // grouping (api/_lib/board.ts) — otherwise "Set A" and "set a" would
  // evaluate as one set server-side but render as two here. Display keeps
  // whichever casing was seen first, rather than forcing lowercase on screen.
  const groups = new Map<string, { display: string; items: typeof status.perItem }>();
  for (const i of status.perItem) {
    if (!i.group) continue;
    const key = i.group.toLowerCase();
    const entry = groups.get(key) ?? { display: i.group, items: [] };
    entry.items.push(i);
    groups.set(key, entry);
  }

  const row = (i: (typeof status.perItem)[number]) => {
    const done = i.currentAmount >= i.requiredAmount;
    return (
      <span
        key={i.itemId}
        className={`bingo-admin-req-pill${done ? " bingo-admin-req-pill--done" : ""}`}
      >
        <img src={itemIconUrl(i.itemId)} alt="" className="bingo-admin-req-pill-icon" />
        {i.name} {i.currentAmount}/{i.requiredAmount}
      </span>
    );
  };

  return (
    <div className="bingo-admin-group-context bingo-admin-req-progress">
      {ungrouped.length > 0 && <span className="bingo-admin-req-set">{ungrouped.map(row)}</span>}
      {[...groups.entries()].map(([key, { display, items }]) => {
        const setDone = items.every((i) => i.currentAmount >= i.requiredAmount);
        return (
          <span
            key={key}
            className={`bingo-admin-req-set${setDone ? " bingo-admin-req-set--done" : ""}`}
          >
            <em>{display}:</em> {items.map(row)}
          </span>
        );
      })}
      {groups.size > 1 && (
        <span className="bingo-admin-req-hint">complete any one set</span>
      )}
    </div>
  );
}
