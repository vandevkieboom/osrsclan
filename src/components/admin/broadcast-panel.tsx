import { useState } from "react";
import { sendBroadcast } from "../../services/admin";

export function BroadcastPanel() {
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const message = broadcastMessage.trim();
    if (!message) return;
    setBroadcasting(true);
    setBroadcastError(null);
    setSent(false);
    try {
      await sendBroadcast(message);
      setBroadcastMessage("");
      setSent(true);
    } catch (err) {
      setBroadcastError(
        err instanceof Error ? err.message : "Failed to send broadcast",
      );
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div className="admin-panel">
      <form onSubmit={handleSendBroadcast} className="admin-card">
        <div className="admin-card-label">Send broadcast</div>
        <textarea
          className="admin-input admin-broadcast-textarea"
          placeholder="Message shown to anyone with plugin broadcasts on"
          rows={4}
          maxLength={300}
          value={broadcastMessage}
          onChange={(e) => setBroadcastMessage(e.target.value)}
          aria-label="Broadcast to clan"
        />
        <div className="admin-section-save">
          <button
            type="submit"
            className="admin-btn-primary"
            disabled={broadcasting || !broadcastMessage.trim()}
          >
            {broadcasting ? "Sending..." : "Send"}
          </button>
          {sent && <span className="admin-saved">Sent.</span>}
        </div>
        {broadcastError && (
          <div className="admin-error">{broadcastError}</div>
        )}
      </form>
    </div>
  );
}
