// Shared icon derivation for bingo tiles — the single source of truth for
// "what does this tile's icon look like," used everywhere a tile icon is
// rendered: the public board (api/board.ts, whose `iconUrl` the website
// renders directly, and whose `iconItemId` the RuneLite plugin prefers —
// see bingo-runelite-plugin's BingoPanel#loadIconInto), the admin panel
// (api/admin/board.ts), and the review queue (api/admin/submissions.ts).
//
// Before this, an admin-pasted icon_url (the website's icon) and the
// plugin's item-id-derived icon were two completely independent things that
// could — and did — show a different picture for the same tile. Now both
// surfaces are built from the same priority chain below.

const ITEM_ICON_BASE = "https://static.runelite.net/cache/item/icon";

export function itemIconUrl(itemId: number): string {
  return `${ITEM_ICON_BASE}/${itemId}.png`;
}

// Keep in sync with bingo-runelite-plugin's BingoPanel#SKILL_SPRITES — same
// keys (including the runecraft/runecrafting and defence/defense aliases),
// so the website and the plugin agree on exactly which goal_key values
// render a skill icon at all, not just what that icon looks like. Values
// here are the OSRS Wiki icon filename stem, not a RuneLite sprite id.
const SKILL_ICON_FILES: Record<string, string> = {
  attack: "Attack",
  strength: "Strength",
  defence: "Defence",
  defense: "Defence",
  ranged: "Ranged",
  prayer: "Prayer",
  magic: "Magic",
  hitpoints: "Hitpoints",
  agility: "Agility",
  herblore: "Herblore",
  thieving: "Thieving",
  crafting: "Crafting",
  fletching: "Fletching",
  mining: "Mining",
  smithing: "Smithing",
  fishing: "Fishing",
  cooking: "Cooking",
  firemaking: "Firemaking",
  woodcutting: "Woodcutting",
  runecraft: "Runecraft",
  runecrafting: "Runecraft",
  slayer: "Slayer",
  farming: "Farming",
  hunter: "Hunter",
  construction: "Construction",
  overall: "Stats",
};

/** The OSRS Wiki's icon for a hiscores skill key ("agility"), or null for an
 * unrecognized one (a typo, or a boss name on the wrong goal_kind). */
export function skillIconUrl(goalKey: string): string | null {
  const file = SKILL_ICON_FILES[goalKey.trim().toLowerCase()];
  return file ? `https://oldschool.runescape.wiki/images/${file}_icon.png` : null;
}

export interface IconableTile {
  iconItemId: number | null;
  itemIds: number[];
  goalKind: "item" | "xp" | "kc";
  goalKey: string;
  /** The pre-icon_item_id icon_url column — only ever used as a last
   * resort, for a tile from before this existed (or a genuinely manual tile
   * with no item at all) where nothing else below can be derived. */
  legacyIconUrl: string;
}

/**
 * The one icon a tile shows — priority: an admin's explicit override
 * (icon_item_id), then a skill icon for an xp-goal tile (there's no
 * meaningful item for those), then the first tracked item, then whatever
 * icon_url this tile happened to have from before this existed. Empty
 * string means "nothing to show" (a manual tile with no item and no
 * override) — callers should render a placeholder, not a broken <img>.
 */
export function deriveTileIconUrl(tile: IconableTile): string {
  if (tile.iconItemId != null) return itemIconUrl(tile.iconItemId);
  if (tile.goalKind === "xp") {
    const skillUrl = skillIconUrl(tile.goalKey);
    if (skillUrl) return skillUrl;
  }
  if (tile.itemIds.length > 0) return itemIconUrl(tile.itemIds[0]);
  return tile.legacyIconUrl;
}
