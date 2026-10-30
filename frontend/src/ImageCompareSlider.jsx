import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical } from "lucide-react";

/**
 * Vertical curtain-wipe slider for comparing two images.
 * Left side = original ("Before"), right side = compressed ("After").
 *
 * Fully mobile touch-optimized with touch-action: pan-y, enlarged 44px thumb target,
 * tap-to-move, and resolution mismatch handling.
 *
 * @param {{ originalSrc: string, compressedSrc: string }} props
 */
function ImageCompareSlider({ originalSrc, compressedSrc }) {
  const [sliderPos, setSliderPos] = useState(50);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);
  const isDragging = useRef(false);

  // Natural dimensions of both images — used to compute shared aspect ratio
  const [origDims, setOrigDims] = useState(null);
  const [compDims, setCompDims] = useState(null);

  // Load natural dimensions from each source
  useEffect(() => {
    if (!originalSrc) return;
    const img = new Image();
    img.onload = () => setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = originalSrc;
  }, [originalSrc]);

  useEffect(() => {
    if (!compressedSrc) return;
    const img = new Image();
    img.onload = () => setCompDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = compressedSrc;
  }, [compressedSrc]);

  // Track container width so the clipped image stays pinned to full width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.offsetWidth);

    return () => observer.disconnect();
  }, []);

  const updatePosition = useCallback((clientX) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragging.current) return;
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Keyboard accessibility: Arrow keys nudge the slider
  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSliderPos((prev) => Math.max(0, prev - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSliderPos((prev) => Math.min(100, prev + 1));
    }
  }, []);

  // Shared display box aspect ratio
  // Capped at 45vh on mobile and 55vh on desktop so buttons never get pushed off-screen
  const aspectRatio = origDims ? origDims.w / origDims.h : 16 / 9;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const maxHeight = typeof window !== "undefined"
    ? window.innerHeight * (isMobile ? 0.45 : 0.55)
    : 500;
  const rawHeight = containerWidth > 0 ? containerWidth / aspectRatio : 0;
  const displayHeight = rawHeight > 0 ? Math.min(rawHeight, maxHeight) : 0;

  // Resolution info for the badges
  const resolutionChanged =
    origDims && compDims && (origDims.w !== compDims.w || origDims.h !== compDims.h);

  // Common style for both images — forced to fill the exact same box
  const imgStyle = {
    width: containerWidth > 0 ? `${containerWidth}px` : "100%",
    height: displayHeight > 0 ? `${displayHeight}px` : "auto",
    objectFit: "contain",
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl select-none cursor-col-resize bg-black/5 dark:bg-white/5 shadow-inner touch-pan-y"
        style={{
          height: displayHeight > 0 ? `${displayHeight}px` : "auto",
          aspectRatio: displayHeight > 0 ? undefined : "16 / 9",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="Image comparison slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(sliderPos)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Bottom layer: Compressed image (full box, always visible on right side) */}
        <img
          src={compressedSrc}
          alt="Compressed"
          className="absolute top-0 left-0 pointer-events-none"
          style={imgStyle}
          draggable={false}
        />

        {/* Top layer: Original image, clipped to sliderPos% */}
        <div
          className="absolute top-0 left-0 overflow-hidden pointer-events-none"
          style={{ width: `${sliderPos}%`, height: "100%" }}
        >
          <img
            src={originalSrc}
            alt="Original"
            className="absolute top-0 left-0 pointer-events-none"
            style={imgStyle}
            draggable={false}
          />
        </div>

        {/* Vertical divider line */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
        >
          <div className="w-0.5 h-full bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.5)]" />

          {/* 44px Touch Target Drag Handle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 sm:w-9 sm:h-9 bg-white text-gray-800 rounded-full shadow-lg border border-black/10 flex items-center justify-center active:scale-110 transition-transform">
            <GripVertical className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </div>
        </div>

        {/* Mobile-Friendly Labels */}
        <span className="absolute top-2 left-2.5 bg-black/60 backdrop-blur-md text-white text-[11px] sm:text-xs font-medium px-2 py-0.5 rounded-lg pointer-events-none flex items-center gap-1 shadow-sm">
          Before
          {origDims && !isMobile && (
            <span className="opacity-70 text-[10px]">{origDims.w}×{origDims.h}</span>
          )}
        </span>
        <span className="absolute top-2 right-2.5 bg-black/60 backdrop-blur-md text-white text-[11px] sm:text-xs font-medium px-2 py-0.5 rounded-lg pointer-events-none flex items-center gap-1 shadow-sm">
          After
          {compDims && !isMobile && (
            <span className="opacity-70 text-[10px]">{compDims.w}×{compDims.h}</span>
          )}
        </span>

        {/* Resolution change indicator */}
        {resolutionChanged && (
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-amber-500/90 backdrop-blur-md text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full pointer-events-none shadow-sm max-w-[90%] truncate">
            {origDims.w}×{origDims.h} → {compDims.w}×{compDims.h}
          </span>
        )}
      </div>
    </div>
  );
}

export default ImageCompareSlider;
