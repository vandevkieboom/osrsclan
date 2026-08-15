import { useState } from "react";
import { sendBroadcast } from "../../services/admin";

interface SentBroadcast {
  message: string;
  sentAt: string;
}

export function BroadcastPanel() {
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [sentBroadcasts, setSentBroadcasts] = useState<SentBroadcast[]>([]);

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const message = broadcastMessage.trim();
    if (!message) return;
    setBroadcasting(true);
    setBroadcastError(null);
    try {
      const broadcast = await sendBroadcast(message);
      setSentBroadcasts((prev) => [
        { message, sentAt: broadcast.updatedAt },
        ...prev,
      ]);
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
    <div className="admin-broadcast-grid">
      <form onSubmit={handleSendBroadcast} className="admin-card">
        <div className="admin-card-label">Send broadcast</div>
        <textarea
          className="admin-input admin-broadcast-textarea"
          placeholder="Message shown to anyone with plugin broadcasts on"
          rows={4}
          maxLength={200}
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
        </div>
        {broadcastError && (
          <div className="admin-error">{broadcastError}</div>
        )}
      </form>
      <div className="admin-card">
        <div className="admin-card-label">Recent broadcasts</div>
        <div className="admin-broadcast-history">
          {sentBroadcasts.length === 0 && (
            <div className="admin-empty">
              No broadcasts sent this session yet.
            </div>
          )}
          {sentBroadcasts.map((b, i) => (
            <div key={i} className="admin-broadcast-history-item">
              <div className="admin-broadcast-history-text">{b.message}</div>
              <div className="admin-broadcast-history-time">
                {new Date(b.sentAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
