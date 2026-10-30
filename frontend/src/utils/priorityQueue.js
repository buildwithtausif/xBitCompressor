/**
 * Priority Queue & Concurrency Worker Pool for Batch Image Compression
 *
 * Prioritizes images using a multi-factor scoring formula:
 * - Shortest Job First (Size, 45%)
 * - Codec Encoding Complexity (PyVips speeds: JPEG > WEBP > PNG, 30%)
 * - Megapixel / Raster Footprint (15%)
 * - User Focus Boost (-1000 score to immediately process selected image, 10%)
 */

const CODEC_WEIGHTS = {
  jpg: 1.0,
  jpeg: 1.0,
  webp: 1.8,
  png: 3.5,
};

export function getFileFormat(file) {
  if (!file) return "jpeg";
  const mime = file.type || "";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  const name = file.name || "";
  const ext = name.split(".").pop().toLowerCase();
  return CODEC_WEIGHTS[ext] ? ext : "jpeg";
}

export function computePriorityScore(item) {
  const sizeMB = (item.file?.size || 0) / (1024 * 1024);
  const sizeScore = sizeMB * 10;

  const fmt = getFileFormat(item.file);
  const codecWeight = (CODEC_WEIGHTS[fmt] || 2.0) * 10;

  const dimScore = item.dimensions
    ? (item.dimensions.width * item.dimensions.height) / 1_000_000
    : 2.0;

  const userBoost = item.isSelected ? -1000 : 0;
  const retryPenalty = (item.retryCount || 0) * 500;

  // Lower score = higher execution priority (processes first)
  return sizeScore * 0.45 + codecWeight * 0.3 + dimScore * 10 * 0.15 + userBoost + retryPenalty;
}

export class BatchWorkerPool {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 2;
    this.items = [];
    this.activeWorkers = 0;
    this.isPaused = false;
    this.isCancelled = false;
    this.compressFn = options.compressFn || null;

    // Callbacks
    this.onItemStart = options.onItemStart || (() => {});
    this.onItemSuccess = options.onItemSuccess || (() => {});
    this.onItemError = options.onItemError || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
  }

  setItems(items) {
    this.items = items.map((it) => ({
      ...it,
      status: it.status || "QUEUED",
      priority: computePriorityScore(it),
      abortController: null,
      retryCount: it.retryCount || 0,
    }));
    this.sortQueue();
  }

  sortQueue() {
    // Only re-sort items that are still QUEUED
    const active = this.items.filter((i) => i.status !== "QUEUED");
    const queued = this.items.filter((i) => i.status === "QUEUED");

    queued.sort((a, b) => a.priority - b.priority);
    this.items = [...active, ...queued];
  }

  boostItem(itemId) {
    this.items = this.items.map((it) => {
      if (it.id === itemId) {
        return {
          ...it,
          isSelected: true,
          priority: computePriorityScore({ ...it, isSelected: true }),
        };
      }
      return {
        ...it,
        isSelected: false,
        priority: computePriorityScore({ ...it, isSelected: false }),
      };
    });
    this.sortQueue();
  }

  start() {
    this.isPaused = false;
    this.isCancelled = false;
    this.pump();
  }

  pause() {
    this.isPaused = true;
  }

  cancelAll() {
    this.isCancelled = true;
    for (const item of this.items) {
      if (item.abortController) {
        item.abortController.abort();
      }
      if (item.status === "QUEUED" || item.status === "PROCESSING") {
        item.status = "CANCELLED";
      }
    }
    this.activeWorkers = 0;
    this.emitProgress();
  }

  retryItem(itemId) {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return;

    item.status = "QUEUED";
    item.error = null;
    item.retryCount = (item.retryCount || 0) + 1;
    item.priority = computePriorityScore(item);
    this.sortQueue();
    this.pump();
  }

  cancelItem(itemId) {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) return;

    if (item.abortController) {
      item.abortController.abort();
    }
    item.status = "CANCELLED";
    this.emitProgress();
    this.pump();
  }

  pump() {
    if (this.isPaused || this.isCancelled) return;

    while (this.activeWorkers < this.concurrency) {
      const nextItem = this.items.find((it) => it.status === "QUEUED");
      if (!nextItem) break;

      this.processItem(nextItem);
    }

    if (this.activeWorkers === 0) {
      const remaining = this.items.filter((it) => it.status === "QUEUED" || it.status === "PROCESSING");
      if (remaining.length === 0) {
        this.onComplete(this.items);
      }
    }
  }

  async processItem(item) {
    this.activeWorkers++;
    item.status = "PROCESSING";
    const controller = new AbortController();
    item.abortController = controller;

    this.onItemStart(item);
    this.emitProgress();

    try {
      if (!this.compressFn) throw new Error("No compression worker function provided");

      const compressedBlob = await this.compressFn(item, controller.signal);

      if (!controller.signal.aborted) {
        item.status = "SUCCESS";
        item.compressedBlob = compressedBlob;
        item.compressedSize = compressedBlob.size;
        item.error = null;
        this.onItemSuccess(item);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        item.status = "CANCELLED";
      } else {
        item.status = "ERROR";
        item.error = err.message || "Failed to compress";
        this.onItemError(item, err);
      }
    } finally {
      this.activeWorkers--;
      item.abortController = null;
      this.emitProgress();
      this.pump();
    }
  }

  emitProgress() {
    const total = this.items.length;
    const completed = this.items.filter((i) => i.status === "SUCCESS").length;
    const failed = this.items.filter((i) => i.status === "ERROR").length;
    const processing = this.items.filter((i) => i.status === "PROCESSING").length;
    const queued = this.items.filter((i) => i.status === "QUEUED").length;

    const originalBytes = this.items.reduce((acc, i) => acc + (i.file?.size || 0), 0);
    const compressedBytes = this.items.reduce((acc, i) => {
      if (i.status === "SUCCESS") return acc + i.compressedSize;
      return acc;
    }, 0);

    const progressPct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

    this.onProgress({
      total,
      completed,
      failed,
      processing,
      queued,
      progressPct,
      originalBytes,
      compressedBytes,
      items: [...this.items],
    });
  }
}

