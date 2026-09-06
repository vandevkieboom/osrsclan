import { useState } from "react";
import type { AdminSubmission } from "../../services/admin";
import type { ItemRequirementsStatus } from "../../services/board";

interface AdminReviewProps {
  submissions: AdminSubmission[] | null;
  /** "grouped" (default) clusters by tile+team for spotting duplicates;
   * "oldest" is meant to show a flat, strictly-chronological queue for
   * clearing a launch-day backlog fastest - see groupSubmissions below for
   * why this has to change what's actually rendered, not just what's
   * requested from the server. */
  sort: "grouped" | "oldest";
  onReview: (
    id: number,
    decision: "approved" | "rejected",
    itemId?: number,
  ) => void;
}

interface Group {
  key: string;
  tileName: string;
  teamName: string;
  iconUrl: string;
  requireUniqueItems: boolean;
  alreadyApprovedItemIds: number[];
  itemRequirementsStatus: ItemRequirementsStatus | null;
  submissions: AdminSubmission[];
}

// Submissions arrive already sorted by tile then team (see
// api/admin/submissions.ts), so a single pass keeps that order — no separate
// sort needed here.
function groupByTileAndTeam(submissions: AdminSubmission[]): Group[] {
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const sub of submissions) {
    const key = `${sub.tileId}:${sub.teamId}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        tileName: sub.tileName,
        teamName: sub.teamName,
        iconUrl: sub.iconUrl,
        requireUniqueItems: sub.requireUniqueItems,
        alreadyApprovedItemIds: sub.alreadyApprovedItemIds,
        itemRequirementsStatus: sub.itemRequirementsStatus,
        submissions: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.submissions.push(sub);
  }
  return groups;
}

// One submission per "group", in the exact order the server sent them
// (oldest first, ignoring tile/team - see api/admin/submissions.ts). This
// used to just be groupByTileAndTeam(submissions) regardless of sort mode,
// which silently re-clustered everything back into tile+team order right
// after the server had gone to the trouble of sending it chronologically -
// the "Oldest first" toggle changed the request and then had its effect
// immediately undone by this component's own rendering.
function groupOldestFirst(submissions: AdminSubmission[]): Group[] {
  return submissions.map((sub) => ({
    key: String(sub.id),
    tileName: sub.tileName,
    teamName: sub.teamName,
    iconUrl: sub.iconUrl,
    requireUniqueItems: sub.requireUniqueItems,
    alreadyApprovedItemIds: sub.alreadyApprovedItemIds,
    itemRequirementsStatus: sub.itemRequirementsStatus,
    submissions: [sub],
  }));
}

/** "Set A: Enhanced crystal weapon seed 0/1, ..." — the per-group/per-item
 * breakdown for an item_requirements tile, so a reviewer can see at a glance
 * which "OR" set is closest to done without re-deriving it from raw counts. */
function ItemRequirementsProgress({ status }: { status: ItemRequirementsStatus }) {
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

function SubmissionRow({
  sub,
  requireUniqueItems,
  itemRequirementsStatus,
  onReview,
}: {
  sub: AdminSubmission;
  requireUniqueItems: boolean;
  itemRequirementsStatus: ItemRequirementsStatus | null;
  onReview: AdminReviewProps["onReview"];
}) {
  // Pre-filled when the plugin already tagged it; editable either way, since
  // an admin reviewing a manual upload can type in what they see themselves.
  const [itemIdText, setItemIdText] = useState(
    sub.itemId != null ? String(sub.itemId) : "",
  );
  const [itemRequirementSelection, setItemRequirementSelection] = useState(
    sub.itemId != null ? String(sub.itemId) : "",
  );

  function parsedItemId(): number | undefined {
    if (itemRequirementsStatus) {
      const n = Number(itemRequirementSelection);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    }
    const n = Number(itemIdText.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  // Only the RuneLite plugin resolves item_id — a manual screenshot upload
  // never does, and this project has no id-to-name lookup outside what an
  // admin typed into item_requirements. So the tile's icon/name is shown
  // only as a group heading (see the group header above), never here: it
  // would make an unreviewed screenshot look like it was confirmed to show
  // that specific item when nobody has actually checked that yet.
  const knownName = itemRequirementsStatus?.perItem.find(
    (i) => i.itemId === sub.itemId,
  )?.name;

  return (
    <div className="bingo-admin-row">
      {sub.itemId != null ? (
        <img
          src={`https://static.runelite.net/cache/item/icon/${sub.itemId}.png`}
          alt=""
          className="bingo-admin-icon"
        />
      ) : (
        <span className="bingo-admin-icon bingo-admin-icon--placeholder" aria-hidden="true" />
      )}
      <div className="bingo-admin-info">
        <div className="bingo-admin-meta">submitted by {sub.submittedBy}</div>
        {sub.itemId != null && (
          <div className="bingo-admin-meta bingo-admin-meta--item">
            {knownName ?? `Item #${sub.itemId}`}
          </div>
        )}
        <div className="bingo-admin-meta bingo-admin-meta--timestamp">
          {new Date(sub.createdAt).toLocaleString()}
        </div>
      </div>
      {itemRequirementsStatus ? (
        <select
          className="admin-select bingo-admin-itemid-input"
          value={itemRequirementSelection}
          onChange={(e) => setItemRequirementSelection(e.target.value)}
          title="Which item this screenshot shows"
        >
          <option value="">Which item?</option>
          {itemRequirementsStatus.perItem.map((i) => (
            <option key={i.itemId} value={i.itemId}>
              {i.name} ({i.currentAmount}/{i.requiredAmount})
            </option>
          ))}
        </select>
      ) : (
        requireUniqueItems && (
          <input
            type="text"
            className="admin-input bingo-admin-itemid-input"
            placeholder="Item ID"
            value={itemIdText}
            onChange={(e) => setItemIdText(e.target.value)}
            title="Which item this screenshot shows — required to check it isn't a duplicate for this team's tile"
          />
        )
      )}
      {sub.proofUrl && (
        <a
          href={sub.proofUrl}
          target="_blank"
          rel="noreferrer"
          className="bingo-admin-proof-link"
        >
          View proof
        </a>
      )}
      <button
        type="button"
        className="bingo-admin-approve"
        disabled={itemRequirementsStatus != null && parsedItemId() === undefined}
        title={
          itemRequirementsStatus != null && parsedItemId() === undefined
            ? "Pick which item this screenshot shows first"
            : undefined
        }
        onClick={() => onReview(sub.id, "approved", parsedItemId())}
      >
        APPROVE
      </button>
      <button
        type="button"
        className="bingo-admin-reject"
        onClick={() => onReview(sub.id, "rejected", parsedItemId())}
      >
        REJECT
      </button>
    </div>
  );
}

export function AdminReview({ submissions, sort, onReview }: AdminReviewProps) {
  if (!submissions || submissions.length === 0) {
    return <div className="bingo-admin-empty">No pending submissions.</div>;
  }

  const groups = sort === "oldest" ? groupOldestFirst(submissions) : groupByTileAndTeam(submissions);

  return (
    <div className="bingo-admin-list">
      {groups.map((group) => (
        <div key={group.key} className="bingo-admin-group">
          <div className="bingo-admin-group-header">
            {group.iconUrl ? (
              <img src={group.iconUrl} alt="" className="bingo-admin-icon" />
            ) : (
              <span className="bingo-admin-icon bingo-admin-icon--placeholder" aria-hidden="true" />
            )}
            <div className="bingo-admin-tile-name">
              {group.tileName} — {group.teamName}
            </div>
            {group.requireUniqueItems && !group.itemRequirementsStatus && (
              <span className="bingo-admin-unique-badge">
                Unique items required
              </span>
            )}
          </div>
          {group.itemRequirementsStatus ? (
            <ItemRequirementsProgress status={group.itemRequirementsStatus} />
          ) : (
            group.requireUniqueItems &&
            group.alreadyApprovedItemIds.length > 0 && (
              <div className="bingo-admin-group-context">
                Already approved for this team: item id
                {group.alreadyApprovedItemIds.length > 1 ? "s" : ""}{" "}
                {group.alreadyApprovedItemIds.join(", ")}
              </div>
            )
          )}
          {group.submissions.map((sub) => (
            <SubmissionRow
              key={sub.id}
              sub={sub}
              requireUniqueItems={group.requireUniqueItems}
              itemRequirementsStatus={group.itemRequirementsStatus}
              onReview={onReview}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
