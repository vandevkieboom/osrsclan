import { useState } from "react";
import { sendBroadcast } from "../../services/admin";

export function BroadcastPanel() {
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [lastBroadcastAt, setLastBroadcastAt] = useState<string | null>(null);

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const message = broadcastMessage.trim();
    if (!message) return;
    setBroadcasting(true);
    setBroadcastError(null);
    try {
      const broadcast = await sendBroadcast(message);
      setLastBroadcastAt(broadcast.updatedAt);
      setBroadcastMessage("");
    } catch (err) {
      setBroadcastError(
        err instanceof Error ? err.message : "Failed to send broadcast",
      );
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <form onSubmit={handleSendBroadcast} className="admin-section">
      <div className="admin-board-form">
        <label className="admin-field">
          <span>Broadcast to clan</span>
          <input
            type="text"
            className="admin-input"
            placeholder="Message shown to anyone with plugin broadcasts on"
            maxLength={200}
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
          />
        </label>
      </div>
      <div className="admin-section-save">
        <button
          type="submit"
          className="admin-btn-primary"
          disabled={broadcasting || !broadcastMessage.trim()}
        >
          {broadcasting ? "Sending..." : "Send"}
        </button>
        {lastBroadcastAt && (
          <span className="admin-saved">
            Sent {new Date(lastBroadcastAt).toLocaleString()}
          </span>
        )}
      </div>
      {broadcastError && <div className="admin-error">{broadcastError}</div>}
    </form>
  );
}
