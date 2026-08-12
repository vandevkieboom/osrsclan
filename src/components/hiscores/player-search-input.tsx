import { SearchIcon } from "./search-icon";

export function PlayerSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="player-search-wrap">
      <SearchIcon />
      <input
        type="text"
        className="player-search-input"
        placeholder="Search by name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
