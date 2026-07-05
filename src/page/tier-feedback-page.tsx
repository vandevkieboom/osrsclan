import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import ranks from "../data/ranks-data";
import type { Item } from "../components/item-card";

const STORAGE_KEY = "clan-tier-feedback-v1";
const POOL_ZONE = "pool";
const EXCLUDE_ZONE = "exclude";
const DRAG_THRESHOLD = 6;

type PoolEntry = { id: string; item: Item };

// Moves a leading fraction like "2/2" to the end of the name so items sort
// and group by their subject ("Doom Uniques 2/2") instead of by the number.
function displayName(name: string): string {
  const match = name.match(/^(\d+\/\d+)\s+(.*)$/);
  return match ? `${match[2]} ${match[1]}` : name;
}

// Items not currently part of the ranking system at all — included here only
// to gauge whether the clan wants them added, and if so where. Kept separate
// from ranks-data.ts so this survey never touches the live ranking system.
const CANDIDATE_ITEMS: Item[] = [
  {
    name: "Abyssal Bludgeon",
    img: "https://oldschool.runescape.wiki/images/Abyssal_bludgeon_detail.png",
    alt: "Abyssal Bludgeon",
  },
  {
    name: "Dragon Claws",
    img: "https://oldschool.runescape.wiki/images/Dragon_claws_detail.png",
    alt: "Dragon Claws",
  },
  {
    name: "Burning Claws",
    img: "https://oldschool.runescape.wiki/images/Burning_claws_detail.png",
    alt: "Burning Claws",
  },
  {
    name: "Barrows Gloves",
    img: "https://oldschool.runescape.wiki/images/Barrows_gloves_detail.png",
    alt: "Barrows Gloves",
  },
  {
    name: "Necklace of Rupture",
    img: "https://oldschool.runescape.wiki/images/Necklace_of_rupture_detail.png",
    alt: "Necklace of Rupture",
  },
  {
    name: "Armadyl Crossbow",
    img: "https://oldschool.runescape.wiki/images/Armadyl_crossbow_detail.png",
    alt: "Armadyl Crossbow",
  },
  {
    name: "Elder Maul",
    img: "https://oldschool.runescape.wiki/images/Elder_maul_detail.png",
    alt: "Elder Maul",
  },
  {
    name: "Soulreaper Axe",
    img: "https://oldschool.runescape.wiki/images/Soulreaper_axe_detail.png",
    alt: "Soulreaper Axe",
  },
  {
    name: "Venator Bow",
    img: "https://oldschool.runescape.wiki/images/Venator_bow_detail.png",
    alt: "Venator Bow",
  },
  {
    name: "Bandos Chestplate and Tassets",
    img: "https://oldschool.runescape.wiki/images/Bandos_chestplate_detail.png",
    alt: "Bandos Chestplate",
  },
  {
    name: "Armadyl Chestplate and Chainskirt",
    img: "https://oldschool.runescape.wiki/images/Armadyl_chestplate_detail.png",
    alt: "Armadyl Chestplate",
  },
  {
    name: "Blue Moon Armour Set",
    img: "https://oldschool.runescape.wiki/images/Blue_moon_helm_detail.png",
    alt: "Blue Moon Helm",
  },
  {
    name: "Inquisitor's Mace",
    img: "https://oldschool.runescape.wiki/images/Inquisitor%27s_mace_detail.png",
    alt: "Inquisitor's Mace",
  },
  {
    name: "Inquisitor's Armour",
    img: "https://oldschool.runescape.wiki/images/Inquisitor%27s_hauberk_detail.png",
    alt: "Inquisitor's Hauberk",
  },
  {
    name: "Saradomin Godsword",
    img: "https://oldschool.runescape.wiki/images/Saradomin_godsword_detail.png",
    alt: "Saradomin Godsword",
  },
  {
    name: "Tonalztics of Ralos",
    img: "https://oldschool.runescape.wiki/images/Tonalztics_of_ralos_detail.png",
    alt: "Tonalztics of Ralos",
  },
  {
    name: "Masori crafting kit",
    img: "https://oldschool.runescape.wiki/images/Masori_crafting_kit_detail.png",
    alt: "Masori crafting kit",
  },
  {
    name: "3/3 Virtus robes",
    img: "https://oldschool.runescape.wiki/images/Virtus_mask_detail.png",
    alt: "3/3 Virtus robes",
  },
  {
    name: "3/3 Masori armour",
    img: "https://oldschool.runescape.wiki/images/Masori_mask_detail.png",
    alt: "3/3 Masori armour",
  },
  {
    name: "Zamorakian spear",
    img: "https://oldschool.runescape.wiki/images/Zamorakian_spear_detail.png",
    alt: "Zamorakian spear",
  },
  {
    name: "Thread of elidinis",
    img: "https://oldschool.runescape.wiki/images/Thread_of_elidinis_detail.png",
    alt: "Thread of elidinis",
  },
];

// Candidate items have no official rank yet, so they sort after every real
// rank and group together at the end of the pool.
const originalRankIndex = (id: string) =>
  id.startsWith("candidate-") ? ranks.length : Number(id.split("-")[0]);

const ALL_ITEMS: PoolEntry[] = ranks
  .flatMap((rank, rankIndex) =>
    rank.items.map((item, itemIndex) => ({
      id: `${rankIndex}-${itemIndex}`,
      item,
    })),
  )
  .concat(
    CANDIDATE_ITEMS.map((item, itemIndex) => ({
      id: `candidate-${itemIndex}`,
      item,
    })),
  )
  .sort((a, b) => {
    const rankDiff = originalRankIndex(a.id) - originalRankIndex(b.id);
    if (rankDiff !== 0) return rankDiff;
    return displayName(a.item.name).localeCompare(displayName(b.item.name));
  });

const ITEM_LOOKUP = new Map(ALL_ITEMS.map((entry) => [entry.id, entry.item]));

type SavedState = {
  placements: Record<string, string>;
};

export function TierFeedbackPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Clan Tier List Feedback";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      document.head.removeChild(meta);
    };
  }, []);

  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragGhost, setDragGhost] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedState;
      setPlacements(parsed.placements ?? {});
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const payload: SavedState = { placements };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [placements]);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        drag.moved = true;
      }
      if (drag.moved && drag.id) {
        e.preventDefault();
        setDragGhost({ id: drag.id, x: e.clientX, y: e.clientY });
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const zoneEl = el?.closest<HTMLElement>("[data-dropzone]");
        setHoverZone(zoneEl?.dataset.dropzone ?? null);
      }
    };

    const handleUp = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      dragStateRef.current = null;
      if (!drag) return;

      if (drag.moved) {
        // Real drag-and-drop of a single item, regardless of any multi-select.
        // Dragging on empty space is a no-op.
        if (drag.id) {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const zoneEl = el?.closest<HTMLElement>("[data-dropzone]");
          if (zoneEl) {
            const zone = zoneEl.dataset.dropzone!;
            setPlacements((prev) => ({ ...prev, [drag.id!]: zone }));
          }
        }
        setDragGhost(null);
        setHoverZone(null);
        setSelectedIds(new Set());
        return;
      }

      // A tap (no meaningful pointer movement).
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = el?.closest<HTMLElement>("[data-dropzone]");
      const zone = zoneEl?.dataset.dropzone;
      const multiSelect = e.shiftKey || e.ctrlKey || e.metaKey;

      setSelectedIds((current) => {
        if (drag.id) {
          const tappedId = drag.id;
          if (multiSelect) {
            // Shift/Ctrl/Cmd-click toggles this item without disturbing the
            // rest of the selection, so several items can be queued up.
            const next = new Set(current);
            if (next.has(tappedId)) next.delete(tappedId);
            else next.add(tappedId);
            return next;
          }
          // Plain tap: select just this item, or clear if it was the only
          // thing already selected.
          if (current.size === 1 && current.has(tappedId)) return new Set();
          return new Set([tappedId]);
        }
        // Tapped empty space in a zone — drop the whole current selection there.
        if (current.size > 0 && zone) {
          setPlacements((prev) => {
            const next = { ...prev };
            current.forEach((id) => {
              next[id] = zone;
            });
            return next;
          });
          return new Set();
        }
        return current;
      });
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  const handleItemPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    dragStateRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  };

  const handleZonePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStateRef.current = {
      id: null,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  };

  const isPlacing = selectedIds.size > 0 || Boolean(dragGhost);

  const itemsByZone = useMemo(() => {
    const map = new Map<string, string[]>();
    map.set(POOL_ZONE, []);
    map.set(EXCLUDE_ZONE, []);
    ranks.forEach((rank) => map.set(rank.name, []));
    ALL_ITEMS.forEach((entry) => {
      const zone = placements[entry.id] ?? POOL_ZONE;
      map.get(zone)?.push(entry.id);
    });
    return map;
  }, [placements]);

  const placedCount =
    ALL_ITEMS.length - (itemsByZone.get(POOL_ZONE)?.length ?? 0);

  const resetAll = () => {
    if (!window.confirm("Clear your entire tier list and start over?")) return;
    setPlacements({});
    setSelectedIds(new Set());
  };

  const takeScreenshot = async () => {
    if (!pageRef.current) return;
    setSelectedIds(new Set());
    setCapturing(true);
    const node = pageRef.current;
    // The decorative tiled background is hotlinked from the wiki and can
    // stall html2canvas indefinitely if the cross-origin fetch is blocked —
    // drop it for the capture only. Item icons load fine and are unaffected.
    node.classList.add("is-capturing");
    try {
      // html2canvas renders a corrupted/ghosted band once the captured area
      // gets tall enough (this page easily exceeds that with 80+ items).
      // Capturing it in short horizontal slices and compositing them onto
      // one canvas ourselves avoids the bug entirely.
      const CHUNK_HEIGHT = 600;
      const scale = window.devicePixelRatio > 1 ? 2 : 1;
      const totalWidth = node.scrollWidth;
      const totalHeight = node.scrollHeight;

      const master = document.createElement("canvas");
      master.width = totalWidth * scale;
      master.height = totalHeight * scale;
      const ctx = master.getContext("2d");
      if (!ctx) throw new Error("2D context unavailable");
      ctx.fillStyle = "#12080a";
      ctx.fillRect(0, 0, master.width, master.height);

      for (let y = 0; y < totalHeight; y += CHUNK_HEIGHT) {
        const chunkHeight = Math.min(CHUNK_HEIGHT, totalHeight - y);
        const chunk = await html2canvas(node, {
          useCORS: true,
          backgroundColor: "#12080a",
          scale,
          x: 0,
          y,
          width: totalWidth,
          height: chunkHeight,
        });
        ctx.drawImage(chunk, 0, y * scale);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        master.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("toBlob returned null");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "clan-rankings-feedback.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      window.alert(
        "Couldn't capture a screenshot in this browser — try your device's screenshot tool instead.",
      );
    } finally {
      node.classList.remove("is-capturing");
      setCapturing(false);
    }
  };

  const renderItem = (id: string) => {
    const item = ITEM_LOOKUP.get(id);
    if (!item) return null;
    const isSelected = selectedIds.has(id);
    const isDragging = dragGhost?.id === id;
    return (
      <div
        key={id}
        className={`tier-item${isSelected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}`}
        onPointerDown={(e) => handleItemPointerDown(e, id)}
        title={displayName(item.name)}
      >
        <span className="tier-item-icon-wrap">
          <img
            className="item-sprite"
            referrerPolicy="no-referrer"
            src={item.img}
            alt={item.alt}
            draggable={false}
          />
        </span>
        <span className="item-name">{displayName(item.name)}</span>
      </div>
    );
  };

  return (
    <div
      ref={pageRef}
      className={`page tier-feedback-page${isPlacing ? " is-placing" : ""}`}
    >
      <div className="header">
        <div className="header-deco">
          <h1 className="title">Time Served</h1>
        </div>
        <div className="subtitle">Clan Ranks Feedback</div>
        <div className="divider" />
        <div className="tier-feedback-intro">
          <p>
            Drag each item into the tier you think it belongs in (or tap it,
            then tap a tier). Shift-click or Ctrl/Cmd-click to select several
            items at once, then tap a tier to move them all in one go. There's
            no right answer, just your honest opinion. Items that shouldn't
            count toward any rank go in the "Shouldn't Be Included" box below.
          </p>
        </div>
        <div className="tier-feedback-toolbar">
          <button type="button" className="tracker-btn" onClick={resetAll}>
            Reset
          </button>
          <button
            type="button"
            className="tracker-btn"
            onClick={takeScreenshot}
            disabled={capturing}
          >
            {capturing ? "Capturing..." : "Screenshot"}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="tracker-btn"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      <div
        className={`tier-pool${hoverZone === POOL_ZONE ? " drag-over" : ""}`}
        data-dropzone={POOL_ZONE}
        onPointerDown={handleZonePointerDown}
      >
        <div className="tier-pool-header">
          {(itemsByZone.get(POOL_ZONE) ?? []).length} items ({placedCount}{" "}
          placed)
        </div>
        <div className="tier-items">
          {(itemsByZone.get(POOL_ZONE) ?? []).map(renderItem)}
          {(itemsByZone.get(POOL_ZONE) ?? []).length === 0 && (
            <div className="tier-empty-hint">All items placed!</div>
          )}
        </div>
      </div>

      <div className="tier-box-list">
        <div
          className={`tier-box tier-box-exclude${hoverZone === EXCLUDE_ZONE ? " drag-over" : ""}`}
          data-dropzone={EXCLUDE_ZONE}
          onPointerDown={handleZonePointerDown}
        >
          <div className="tier-box-header">
            <span className="rank-name rank-name-exclude">
              Where to include these items
            </span>
            <span className="tier-box-count">
              {(itemsByZone.get(EXCLUDE_ZONE) ?? []).length}
            </span>
          </div>
          <div className="tier-items">
            {(itemsByZone.get(EXCLUDE_ZONE) ?? []).map(renderItem)}
            {(itemsByZone.get(EXCLUDE_ZONE) ?? []).length === 0 && (
              <div className="tier-empty-hint">
                Items that shouldn't count toward any rank
              </div>
            )}
          </div>
        </div>

        {ranks.map((rank) => (
          <div
            key={rank.name}
            className={`tier-box${hoverZone === rank.name ? " drag-over" : ""}`}
            style={{ ["--rank-color" as any]: rank.color }}
            data-dropzone={rank.name}
            onPointerDown={handleZonePointerDown}
          >
            <div className="tier-box-header">
              <img
                className="rank-gem"
                src={rank.icon}
                alt={`${rank.name} Clan Icon`}
                referrerPolicy="no-referrer"
              />
              <span className="rank-name">{rank.name}</span>
              <span className="tier-box-count">
                {(itemsByZone.get(rank.name) ?? []).length}
              </span>
            </div>
            <div className="tier-items">
              {(itemsByZone.get(rank.name) ?? []).map(renderItem)}
              {(itemsByZone.get(rank.name) ?? []).length === 0 && (
                <div className="tier-empty-hint">Drop items here</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {dragGhost &&
        (() => {
          const item = ITEM_LOOKUP.get(dragGhost.id);
          if (!item) return null;
          return (
            <div
              className="tier-ghost"
              style={{ left: dragGhost.x, top: dragGhost.y }}
            >
              <img
                className="item-sprite"
                referrerPolicy="no-referrer"
                src={item.img}
                alt=""
              />
            </div>
          );
        })()}
    </div>
  );
}
