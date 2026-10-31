from __future__ import annotations

import math
import re as regex
from typing import Any, Callable

import pyvips as vips


class ImageService:
    # this approach for removing metadata may not be the best but its good for now, we can improve it later on.
    image_garbage_metadata: dict[str, str] = {
        # metadata containers
        "exifs": r"^exif-.*",
        "xmp": r"^xmp-.*",
        "iptc": r"^iptc-.*",
        "photoshop": r"^photoshop-.*",
        # embedded previews
        "jpeg_thumbnail": r"^jpeg-thumbnail-.*",
        "thumbnail": r"^thumbnail-.*",
        # descriptions and comments
        "image_description": r"^image-description.*",
        "comment": r".*(?:comment|description|caption).*",
        # software and editing history
        "software": r".*(?:software|processing-history|history).*",
    }
    # this attribute holds the list of supported file types.
    supported_filetypes: list[str] = ["jpeg", "jpg", "png", "webp"]

    image: bytes | bytearray | memoryview | Any | None
    filetype: str
    ratio: float

    def __init__(
        self,
        image: bytes | bytearray | memoryview | Any,
        filetype: str,
        ratio: float = 0.8,
    ) -> None:
        self.image = image
        self.filetype = filetype
        self.ratio = ratio

    # dynamically call the appropriate compression method based on the filetype of the image.
    @property
    def compress(self) -> bytes:
        if self.filetype not in self.supported_filetypes:
            raise ValueError(
                f"Unsupported file type: {self.filetype}. Supported file types are: {', '.join(self.supported_filetypes)}"
            )

        dispatch_table: dict[str, Callable[[], bytes]] = {
            "jpeg": self._compress_jpeg,
            "jpg": self._compress_jpeg,
            "png": self._compress_png,
            "webp": self._compress_webp,
        }

        method = dispatch_table.get(self.filetype.lower())

        if method is None:
            raise AttributeError(
                f"compression method for '{self.filetype}' not found in {self.__class__.__name__}"
            )

        return method()

    def _get_buffer(self) -> bytes:
        if self.image is None:
            raise ValueError("No image buffer provided or image has already been cleaned up.")
        if isinstance(self.image, (bytes, bytearray, memoryview)):
            return bytes(self.image)
        if hasattr(self.image, "getvalue") and callable(getattr(self.image, "getvalue", None)):
            val = self.image.getvalue()
            if isinstance(val, (bytes, bytearray, memoryview)):
                return bytes(val)
        if hasattr(self.image, "read") and callable(getattr(self.image, "read", None)):
            val = self.image.read()
            if isinstance(val, (bytes, bytearray, memoryview)):
                return bytes(val)
        return bytes(self.image)

    def cleanup(self) -> None:
        """Release underlying image buffers."""
        close_method = getattr(self.image, "close", None)
        if callable(close_method):
            try:
                close_method()
            except Exception:
                pass
        self.image = None

    # protected methods for metadata removal and compression
    def _remove_metadata(self, target_image: vips.Image) -> vips.Image:
        for pattern in self.image_garbage_metadata.values():
            for field in target_image.get_fields():
                if regex.match(pattern, field):
                    target_image.remove(field)
        return target_image

    def _compress_jpeg(self) -> bytes:
        image_buffer: vips.Image = vips.Image.new_from_buffer(
            self._get_buffer(), "", access="sequential"
        ).autorot()
        # autorot() bakes the orientation into the image, so we don't need to worry about it later. after this we can remove the orientation metadata from the image.
        target_image: vips.Image = self._remove_metadata(image_buffer)

        compressed: bytes = target_image.jpegsave_buffer(
            Q=max(1, min(round(self.ratio * 100), 100)),
            trellis_quant=True,
            overshoot_deringing=True,
            optimize_coding=True,
            optimize_scans=True,
            interlace=True,
            subsample_mode="on",
        )
        return compressed

    def _compress_png(self) -> bytes:
        image_buffer: vips.Image = vips.Image.new_from_buffer(
            self._get_buffer(), "", access="sequential"
        ).autorot()
        target_image: vips.Image = self._remove_metadata(image_buffer)

        compressed: bytes = target_image.pngsave_buffer(
            Q=max(1, min(round(self.ratio * 100), 100)),
            interlace=True,
            palette=True,
        )
        return compressed

    def _compress_webp(self) -> bytes:
        image_buffer: vips.Image = vips.Image.new_from_buffer(
            self._get_buffer(), "", access="sequential"
        ).autorot()
        target_image: vips.Image = self._remove_metadata(image_buffer)

        compressed: bytes = target_image.webpsave_buffer(
            Q=max(1, min(round(self.ratio * 100), 100)),
            lossless=False,
            effort=4,
        )
        return compressed


class CustomSize(ImageService):
    """
    CustomSize dynamically calculates adjustment factors (dimension scaling and quality factor Q)
    to achieve a desired target file size in bytes using an optimized BPP heuristic and binary search.
    """

    codec_bpp_heuristic: dict[str, float] = {
        "jpeg": 0.8,
        "jpg": 0.8,
        "webp": 0.65,
        "png": 1.8,
    }

    target_size: int
    tolerance: float
    max_iterations: int
    allow_resize: bool
    calculated_scale: float
    calculated_quality: int

    def __init__(
        self,
        image: bytes | bytearray | memoryview | Any,
        filetype: str,
        target_size: int,
        tolerance: float = 0.05,
        max_iterations: int = 6,
        ratio: float = 0.8,
        allow_resize: bool = True,
    ) -> None:
        super().__init__(image, filetype, ratio=ratio)
        if target_size <= 0:
            raise ValueError(f"target_size must be a positive integer in bytes, got: {target_size}")
        self.target_size = target_size
        self.tolerance = tolerance
        self.max_iterations = max_iterations
        self.allow_resize = allow_resize
        self.calculated_scale = 1.0
        self.calculated_quality = 80

    def _encode_trial(self, img: vips.Image, q: int) -> bytes:
        ft: str = self.filetype.lower()
        if ft in ("jpeg", "jpg"):
            trial: bytes = img.jpegsave_buffer(
                Q=q,
                trellis_quant=True,
                overshoot_deringing=True,
                optimize_coding=True,
                optimize_scans=True,
                interlace=True,
                subsample_mode="on",
            )
            return trial
        elif ft == "webp":
            trial = img.webpsave_buffer(
                Q=q,
                lossless=False,
                effort=4,
                min_size=True,
            )
            return trial
        elif ft == "png":
            trial = img.pngsave_buffer(
                Q=q,
                interlace=True,
                palette=True,
                compression=9,
            )
            return trial
        raise ValueError(f"Unsupported file type: {self.filetype}")

    @property
    def compress(self) -> bytes:
        if self.filetype not in self.supported_filetypes:
            raise ValueError(
                f"Unsupported file type: {self.filetype}. Supported file types are: {', '.join(self.supported_filetypes)}"
            )

        raw_bytes: bytes = self._get_buffer()
        image_buffer: vips.Image = vips.Image.new_from_buffer(raw_bytes, "").autorot()
        target_image: vips.Image = self._remove_metadata(image_buffer)

        # If image is JPEG and has an alpha channel, composite over a pure white matte
        if self.filetype.lower() in ("jpeg", "jpg") and target_image.hasalpha():
            target_image = target_image.flatten(background=[255, 255, 255])

        orig_w: int = int(target_image.width)
        orig_h: int = int(target_image.height)
        orig_pixels: int = orig_w * orig_h

        scale: float = 1.0
        working_image: vips.Image = target_image

        if not self.allow_resize:
            # Strictly lock scale to 1.0 (zero dimension modifications)
            scale = 1.0
            working_image = target_image
        else:
            desired_bpp: float = self.codec_bpp_heuristic.get(self.filetype.lower(), 0.8)
            target_pixels: float = (self.target_size * 8) / desired_bpp

            # If pixel budget accommodates native resolution, or if native resolution at Q=50 fits, preserve scale at 1.0
            if target_pixels >= orig_pixels:
                scale = 1.0
                working_image = target_image
            else:
                buf_probe: bytes = self._encode_trial(target_image, 50)
                if len(buf_probe) <= self.target_size:
                    scale = 1.0
                    working_image = target_image
                else:
                    scale = min(1.0, math.sqrt(target_pixels / orig_pixels))
                    min_dim: float = min(orig_w * scale, orig_h * scale)
                    if min_dim < 16:
                        scale = max(16.0 / orig_w, 16.0 / orig_h)
                    working_image = target_image.resize(scale)

        best_buf: bytes | None = None
        smallest_buf: bytes | None = None
        smallest_sz: float = float("inf")

        # When resize is locked, expand binary search range all the way down to Q=1
        low_q: int
        high_q: int
        if not self.allow_resize:
            low_q, high_q = 1, 95
        else:
            low_q, high_q = 15, 95

        iterations: int = self.max_iterations + (2 if not self.allow_resize else 0)

        for _ in range(iterations):
            mid_q: int = (low_q + high_q) // 2
            trial_buf: bytes = self._encode_trial(working_image, mid_q)
            sz: int = len(trial_buf)

            if sz < smallest_sz:
                smallest_sz = float(sz)
                smallest_buf = trial_buf

            if sz <= self.target_size:
                best_buf = trial_buf
                self.calculated_quality = mid_q
                if sz >= self.target_size * (1 - self.tolerance):
                    break
                low_q = mid_q + 1
            else:
                high_q = mid_q - 1

        # Fallback if image was exceptionally complex and could not fit under target_size
        if best_buf is None and smallest_sz > self.target_size:
            if self.allow_resize:
                reduction: float = math.sqrt(self.target_size / smallest_sz) * 0.92
                scale = max(0.01, scale * reduction)
                working_image = target_image.resize(scale)
                trial_buf = self._encode_trial(working_image, 35)
                if len(trial_buf) <= self.target_size:
                    best_buf = trial_buf
                    self.calculated_quality = 35
                else:
                    best_buf = self._encode_trial(working_image, 15)
                    self.calculated_quality = 15
            else:
                # Ensure the absolute lowest floor at Q=1 has been tested without modifying dimensions
                trial_buf = self._encode_trial(working_image, 1)
                if len(trial_buf) < smallest_sz:
                    smallest_sz = float(len(trial_buf))
                    smallest_buf = trial_buf
                best_buf = smallest_buf
                self.calculated_quality = 1

        self.calculated_scale = scale
        self.ratio = self.calculated_quality / 100.0

        if best_buf is not None:
            return best_buf
        if smallest_buf is not None:
            return smallest_buf
        return self._encode_trial(working_image, 15)
