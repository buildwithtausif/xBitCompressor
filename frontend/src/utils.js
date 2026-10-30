/**
 * Formats a byte count into a human-readable string.
 * Automatically picks B, KB, or MB based on magnitude.
 *
 * @param {number} bytes - The byte count to format.
 * @param {number} [decimals=2] - Number of decimal places.
 * @returns {string} e.g. "4.20 MB", "320 KB", "15 B"
 */
export function formatFileSize(bytes, decimals = 2) {
  if (bytes == null || isNaN(bytes)) return "0 B";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
}

/**
 * Returns the file extension (lowercase, without dot) from a File object or filename.
 * @param {File|string} file
 * @returns {string} e.g. "jpeg", "png", "webp"
 */
export function getFileExtension(file) {
  const name = typeof file === "string" ? file : file?.name || "";
  return name.split(".").pop().toLowerCase();
}

/**
 * Returns a display-friendly format label from a MIME type or filename.
 * @param {File} file
 * @returns {string} e.g. "JPEG", "PNG", "WEBP"
 */
export function getFormatLabel(file) {
  if (!file) return "";
  const mime = file.type || "";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPEG";
  if (mime.includes("png")) return "PNG";
  if (mime.includes("webp")) return "WEBP";
  // Fallback to extension
  const ext = getFileExtension(file).toUpperCase();
  if (ext === "JPG") return "JPEG";
  return ext;
}

