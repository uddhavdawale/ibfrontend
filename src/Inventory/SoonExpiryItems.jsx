
import React from "react";
import { useNavigate } from "react-router-dom";
import "./SoonExpiryItems.css";

const THRESHOLD_DAYS = 30; // Define the threshold for "soon expiry"

const SoonExpiryItems = () => {
  const navigate = useNavigate();

  // Example items (later you’ll get from API / Redux / Zustand)
  const items = [
    {
      id: "P1001",
      name: "Paracetamol Strip",
      batch: "BAT2045",
      expiry: "2026-05-10",
      daysLeft: 21,
      quantity: 123,
      status: "warning",
    },
    {
      id: "P1002",
      name: "Sunscreen Lotion",
      batch: "BAT3011",
      expiry: "2026-04-22",
      daysLeft: 13,
      quantity: 56,
      status: "warning",
    },
    {
      id: "P1003",
      name: "Antibiotic Syrup",
      batch: "BAT5002",
      expiry: "2026-04-15",
      daysLeft: 6,
      quantity: 89,
      status: "critical",
    },
  ];

  const THRESHOLD_DAYS = 30; // “soon expiry” window

  return (
    <div className="soon-expiry-page">
      <div style={{ marginBottom: "16px" }}>
        <h2>⚠️ Soon Expiry Items (≤ {THRESHOLD_DAYS} days)</h2>
        <p>
          Monitor items that are nearing expiry and take action (sell, return, or write off).
        </p>
      </div>

      {items.length === 0 ? (
        <p>No items near expiry.</p>
      ) : (
        <table className="soon-expiry-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>Days Left</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={`status-${item.status}`}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/inventory/item/${item.id}`)}
              >
                <td>{item.name}</td>
                <td>{item.batch}</td>
                <td>{item.expiry}</td>
                <td>{item.daysLeft} days</td>
                <td>{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SoonExpiryItems;