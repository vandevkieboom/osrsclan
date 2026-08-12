import { useState } from "react";
import type { AdminSubmission } from "../../services/admin";

interface AdminReviewProps {
  submissions: AdminSubmission[] | null;
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
        submissions: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.submissions.push(sub);
  }
  return groups;
}

function SubmissionRow({
  sub,
  requireUniqueItems,
  onReview,
}: {
  sub: AdminSubmission;
  requireUniqueItems: boolean;
  onReview: AdminReviewProps["onReview"];
}) {
  // Pre-filled when the plugin already tagged it; editable either way, since
  // an admin reviewing a manual upload can type in what they see themselves.
  const [itemIdText, setItemIdText] = useState(
    sub.itemId != null ? String(sub.itemId) : "",
  );

  function parsedItemId(): number | undefined {
    const n = Number(itemIdText.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  return (
    <div className="bingo-admin-row">
      <img src={sub.iconUrl} alt="" className="bingo-admin-icon" />
      <div className="bingo-admin-info">
        <div className="bingo-admin-meta">submitted by {sub.submittedBy}</div>
        <div className="bingo-admin-meta bingo-admin-meta--timestamp">
          {new Date(sub.createdAt).toLocaleString()}
        </div>
      </div>
      {requireUniqueItems && (
        <input
          type="text"
          className="admin-input bingo-admin-itemid-input"
          placeholder="Item ID"
          value={itemIdText}
          onChange={(e) => setItemIdText(e.target.value)}
          title="Which item this screenshot shows — required to check it isn't a duplicate for this team's tile"
        />
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

export function AdminReview({ submissions, onReview }: AdminReviewProps) {
  if (!submissions || submissions.length === 0) {
    return <div className="bingo-admin-empty">No pending submissions.</div>;
  }

  const groups = groupByTileAndTeam(submissions);

  return (
    <div className="bingo-admin-list">
      {groups.map((group) => (
        <div key={group.key} className="bingo-admin-group">
          <div className="bingo-admin-group-header">
            <img src={group.iconUrl} alt="" className="bingo-admin-icon" />
            <div className="bingo-admin-tile-name">
              {group.tileName} — {group.teamName}
            </div>
            {group.requireUniqueItems && (
              <span className="bingo-admin-unique-badge">
                Unique items required
              </span>
            )}
          </div>
          {group.requireUniqueItems &&
            group.alreadyApprovedItemIds.length > 0 && (
              <div className="bingo-admin-group-context">
                Already approved for this team: item id
                {group.alreadyApprovedItemIds.length > 1 ? "s" : ""}{" "}
                {group.alreadyApprovedItemIds.join(", ")}
              </div>
            )}
          {group.submissions.map((sub) => (
            <SubmissionRow
              key={sub.id}
              sub={sub}
              requireUniqueItems={group.requireUniqueItems}
              onReview={onReview}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
