import fs from "fs/promises";

/**
 * Deletes a file from disk, silently ignoring errors.
 * @param {string} filePath - Path to file to remove.
 */
export async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be gone — that's fine
  }
}

/**
 * Removes Excel output files older than `maxAgeMs` milliseconds.
 * Call this on a schedule if needed.
 * @param {string} outputDir - Directory containing .xlsx files.
 * @param {number} maxAgeMs  - Maximum age in milliseconds (default: 1 hour).
 */
export async function purgeOldOutputs(outputDir, maxAgeMs = 60 * 60 * 1000) {
  try {
    const files = await fs.readdir(outputDir);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith(".xlsx")) continue;
      const filePath = `${outputDir}/${file}`;
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        console.log(`🗑  Purged old output: ${file}`);
      }
    }
  } catch {
    // Directory may not exist yet
  }
}
