import { useEffect, useState } from "react";
import {
  fetchBoardConfig,
  resetBingo,
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

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

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

  async function handleResetBingo() {
    if (
      !window.confirm(
        "Start a fresh bingo? This permanently clears every team's tile " +
          "submissions (proof images included) and everyone's xp/kc goal " +
          "progress. Tiles, teams, and donations are not affected. This " +
          "cannot be undone.",
      )
    )
      return;
    setResetting(true);
    setResetError(null);
    setResetDone(false);
    try {
      await resetBingo();
      setResetDone(true);
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : "Failed to reset bingo",
      );
    } finally {
      setResetting(false);
    }
  }

  if (!config)
    return <div className="admin-panel">{error ?? "Loading..."}</div>;

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}

      <form onSubmit={handleSaveConfig} className="admin-section">
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
        </div>

        <label className="admin-tile-unique-toggle">
          <input
            type="checkbox"
            checked={config.bingoActive}
            onChange={(e) =>
              setConfig({ ...config, bingoActive: e.target.checked })
            }
          />
          Bingo event active
        </label>
        <p className="admin-field-hint">
          Turn off between events — the RuneLite plugin backs its board
          polling down to an occasional check instead of every couple
          minutes, since the plugin is a general clan tool people keep
          running even when no bingo is happening. Doesn't affect chat
          commands, live-stream or broadcast notifications.
        </p>

        <div className="admin-section-save">
          <button type="submit" className="admin-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="admin-saved">Saved.</span>}
        </div>
      </form>

      <div className="admin-section admin-board-form">
        <label className="admin-field">
          <span>Start a fresh bingo</span>
          <p className="admin-field-hint">
            Clears every team's tile submissions (including the uploaded
            proof images) and everyone's xp/kc goal progress, so the board
            reads as if nothing has been submitted yet. Tiles, teams, and
            donations are left alone. This cannot be undone.
          </p>
          <button
            type="button"
            className="admin-btn-danger"
            disabled={resetting}
            onClick={handleResetBingo}
          >
            {resetting ? "Resetting..." : "Start fresh bingo"}
          </button>
        </label>
        {resetDone && <span className="admin-saved">Reset.</span>}
        {resetError && <div className="admin-error">{resetError}</div>}
      </div>
    </div>
  );
}
