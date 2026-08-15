import { useEffect, useState } from "react";
import {
  addDonation,
  deleteDonation,
  fetchDonations,
  updateDonation,
  type Donation,
} from "../../services/admin";
import { PLACEHOLDER_DONATIONS } from "./placeholders";

function formatGp(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M gp`
    : `${n.toLocaleString()} gp`;
}

function DonationRow({
  donation,
  onSave,
  onDelete,
}: {
  donation: Donation;
  onSave: (name: string, amountGp: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(donation.name);
  const [amount, setAmount] = useState(String(donation.amountGp));
  const [prevDonation, setPrevDonation] = useState(donation);
  if (
    donation.name !== prevDonation.name ||
    donation.amountGp !== prevDonation.amountGp
  ) {
    setPrevDonation(donation);
    setName(donation.name);
    setAmount(String(donation.amountGp));
  }

  function commit() {
    const n = name.trim();
    const a = Math.max(0, Math.floor(Number(amount)) || 0);
    if (n && (n !== donation.name || a !== donation.amountGp)) {
      onSave(n, a);
    } else {
      setName(donation.name);
      setAmount(String(donation.amountGp));
    }
  }

  return (
    <div className="admin-row">
      <input
        type="text"
        className="admin-input admin-row-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
      />
      <input
        type="number"
        min={0}
        className="admin-input admin-donation-amount-input"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <button type="button" className="admin-btn-danger" onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}

function DonationAddRow({
  onSave,
  onCancel,
}: {
  onSave: (name: string, amountGp: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  return (
    <div className="admin-row">
      <input
        type="text"
        className="admin-input admin-row-input"
        placeholder="Donor name / RSN"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="number"
        min={0}
        className="admin-input admin-donation-amount-input"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button
        type="button"
        className="admin-btn-primary"
        onClick={() =>
          name.trim() &&
          onSave(name.trim(), Math.max(0, Math.floor(Number(amount)) || 0))
        }
      >
        Save
      </button>
      <button type="button" className="admin-btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function DonationsPanel() {
  const [donations, setDonations] = useState<Donation[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetchDonations()
      .then(setDonations)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          setDonations(PLACEHOLDER_DONATIONS);
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to load donations",
        );
      });
  }

  useEffect(reload, []);

  async function handleAdd(name: string, amountGp: number) {
    try {
      await addDonation(name, amountGp);
      setAdding(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add donation");
    }
  }

  async function handleSave(id: number, name: string, amountGp: number) {
    try {
      await updateDonation(id, name, amountGp);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update donation",
      );
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteDonation(id);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete donation",
      );
    }
  }

  if (!donations)
    return <div className="admin-panel">{error ?? "Loading..."}</div>;

  const totalPot = donations.reduce((s, d) => s + d.amountGp, 0);
  const topDonor = donations.reduce<Donation | null>(
    (top, d) => (!top || d.amountGp > top.amountGp ? d : top),
    null,
  );

  return (
    <div className="admin-panel">
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-donations-grid">
        <div>
          <div className="admin-donations-list">
            {donations.map((d) => (
              <DonationRow
                key={d.id}
                donation={d}
                onSave={(name, amountGp) => handleSave(d.id, name, amountGp)}
                onDelete={() => handleDelete(d.id)}
              />
            ))}
            {adding && (
              <DonationAddRow
                onSave={handleAdd}
                onCancel={() => setAdding(false)}
              />
            )}
          </div>
          {donations.length === 0 && !adding && (
            <div className="admin-empty">No donations recorded yet.</div>
          )}
          {!adding && (
            <button
              type="button"
              className="admin-tile-list-add"
              onClick={() => setAdding(true)}
            >
              + Add Donor
            </button>
          )}
        </div>
        <div className="admin-donation-stats">
          <div className="admin-card admin-card--tight">
            <div className="admin-card-label">Total pot</div>
            <div className="admin-stat-value">{formatGp(totalPot)}</div>
          </div>
          <div className="admin-card admin-card--tight">
            <div className="admin-card-label">Top donor</div>
            <div className="admin-stat-sub-name">
              {topDonor?.name ?? "No donations yet"}
            </div>
            {topDonor && (
              <div className="admin-stat-sub-amount">
                {formatGp(topDonor.amountGp)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
