function pad(value) {
  return String(value || "").padStart(2, "0");
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  return `${pad(match[1])}:${match[2]}:${match[3] || "00"}`;
}

function fileTimestamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

module.exports = { normalizeDate, normalizeTime, fileTimestamp };
