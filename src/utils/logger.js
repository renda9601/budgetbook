function scrub(message) {
  return String(message || "")
    .replace(/\b\d{2,6}-\d{2,6}-\d{2,8}\b/g, "[REDACTED_ACCOUNT]")
    .replace(/\b\d{6}-?\d{7}\b/g, "[REDACTED_ID]")
    .replace(/\b\d{6}\b/g, "[REDACTED_6_DIGITS]");
}

function stamp() {
  return new Date().toISOString();
}

function log(level, message, details) {
  const line = `[${stamp()}] ${level.toUpperCase()} ${scrub(message)}`;
  console.log(line);
  if (details !== undefined) console.log(scrub(typeof details === "string" ? details : JSON.stringify(details, null, 2)));
}

module.exports = {
  info: (message, details) => log("info", message, details),
  warn: (message, details) => log("warn", message, details),
  error: (message, details) => log("error", message, details),
  scrub
};
