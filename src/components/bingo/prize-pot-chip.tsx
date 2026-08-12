export function PrizePotChip({ total }: { total: string }) {
  if (!total) return null;
  return (
    <div className="bingo-prizepot-chip">
      <img
        className="bingo-prizepot-chip-icon"
        src="https://oldschool.runescape.wiki/images/Coins_detail.png"
        alt=""
        aria-hidden="true"
      />
      <div className="bingo-prizepot-chip-text">
        <span className="bingo-prizepot-chip-label">PRIZE POT</span>
        <span className="bingo-prizepot-chip-amount">{total} GP</span>
      </div>
    </div>
  );
}
