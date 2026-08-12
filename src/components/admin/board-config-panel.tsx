import { useEffect, useState } from "react";
import {
  fetchBoardConfig,
  updateBoardConfig,
  type BoardConfig,
} from "../../services/admin";
import { PLACEHOLDER_BOARD_CONFIG } from "./placeholders";

const SIZE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10];

export function BoardConfigPanel() {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function reload() {
    fetchBoardConfig()
      .then(setConfig)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setConfig(PLACEHOLDER_BOARD_CONFIG);
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to load board config",
        );
      });
  }

  useEffect(reload, []);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateBoardConfig(config);
      setConfig(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  if (!config)
    return <div className="admin-panel">{error ?? "Loading..."}</div>;

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      <form onSubmit={handleSaveConfig}>
        <div className="admin-board-form">
          <label className="admin-field">
            <span>Event name</span>
            <input
              type="text"
              className="admin-input"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Grid size</span>
            <select
              className="admin-select"
              value={config.size}
              onChange={(e) =>
                setConfig({ ...config, size: Number(e.target.value) })
              }
            >
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} × {s}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Prize pot total</span>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. 51.50M"
              value={config.prizePot.total}
              onChange={(e) =>
                setConfig({ ...config, prizePot: { total: e.target.value } })
              }
            />
          </label>
        </div>

        <div className="admin-section-save">
          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="admin-saved">Saved.</span>}
        </div>
      </form>
    </div>
  );
}
