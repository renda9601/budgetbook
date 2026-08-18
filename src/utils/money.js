function parseMoney(value) {
  const text = String(value || "").replace(/[,\s원]/g, "").replace(/[^\d.-]/g, "");
  if (!text || text === "-" || text === ".") return 0;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : 0;
}

module.exports = { parseMoney };
