// mongo-init.js
// MongoDB initialization script for the whatsapp_logs database.
// This script runs automatically when the container starts for the first time
// (mounted at /docker-entrypoint-initdb.d/mongo-init.js).
// For Railway deployments, run it manually — see railway-mongo-notes.md.

// Switch to (or create) the target database.
db = db.getSiblingDB("whatsapp_logs");

// ---------------------------------------------------------------------------
// Collection: message_logs
// Matches the Mongoose schema in models/MessageLog.js of the WhatsApp bot.
// ---------------------------------------------------------------------------
db.createCollection("message_logs");

// Seed documents — two paired messages showing a typical echo-bot exchange.
db.message_logs.insertMany([
  {
    phone: "+1234567890",
    text: "Hola",
    timestamp: new Date(),
    status: "received",
  },
  {
    phone: "+1234567890",
    text: "Echo: Hola",
    timestamp: new Date(),
    status: "sent",
  },
]);

// ---------------------------------------------------------------------------
// Index 1: Compound index for efficient per-user log queries.
// Queries such as "fetch the latest N messages for phone X" benefit from this
// index because MongoDB can satisfy them with a single index scan, sorted in
// descending timestamp order without an additional sort stage.
// ---------------------------------------------------------------------------
db.message_logs.createIndex(
  { phone: 1, timestamp: -1 },
  { name: "phone_timestamp_idx" }
);

// ---------------------------------------------------------------------------
// Index 2: TTL index — auto-purge documents older than 90 days.
//
// Why 90 days?
//   WhatsApp conversation logs are primarily useful for short-term customer
//   support follow-up and bot diagnostics. After 90 days, the operational
//   value drops significantly while storage costs keep growing.
//   90 days (7 776 000 seconds) balances compliance, debuggability, and cost.
//
// How to change the retention window:
//   Run the following command against the whatsapp_logs database, replacing
//   the number of seconds with the desired value (e.g. 30 days = 2592000):
//
//     db.runCommand({
//       collMod: "message_logs",
//       index: {
//         keyPattern: { timestamp: 1 },
//         expireAfterSeconds: <new_value>
//       }
//     });
//
// Note: MongoDB's TTL background task runs approximately once per minute, so
// documents may linger for up to 60 seconds after their expiry time.
// ---------------------------------------------------------------------------
db.message_logs.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 7776000, name: "timestamp_ttl_idx" }
);
