import type { BoardTeam } from "../../services/board";

export function TeamCard({ team }: { team: BoardTeam }) {
  return (
    <div
      className="bingo-team-card"
      style={{ "--team-accent": team.accentColor } as React.CSSProperties}
    >
      {team.isLeading && (
        <div className="bingo-team-leading-badge">
          {team.completeCount === team.totalTiles ? "WINNER" : "LEADING"}
        </div>
      )}
      <div className="bingo-team-name">{team.name}</div>
      <div className="bingo-team-members">
        {team.memberCount} members
        {team.captainName ? ` · captain ${team.captainName}` : ""}
      </div>
      <div className="bingo-team-progress-track">
        <div
          className="bingo-team-progress-fill"
          style={{ width: `${team.pct}%` }}
        />
      </div>
      <div className="bingo-team-count">
        {team.completeCount} / {team.totalTiles} tiles complete
      </div>
    </div>
  );
}
