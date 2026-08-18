const fs = require("fs/promises");
const path = require("path");

async function exportJson(rows, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  return filePath;
}

module.exports = { exportJson };
