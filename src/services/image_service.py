import pyvips as vips
import re as regex
import math

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
        "software": r".*(?:software|processing-history|history).*"
    }
    # this attribute holds the list of supported file types.
    supported_filetypes: list[str] = ["jpeg", "jpg", "png", "webp"]

    def __init__(self, image, filetype: str, ratio: float = 0.8):
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

        dispatch_table = {
            "jpeg": self._compress_jpeg,
            "jpg": self._compress_jpeg,
            "png": self._compress_png,
            "webp": self._compress_webp
        }

        method = dispatch_table.get(self.filetype.lower())

        if not callable(method):
            raise AttributeError(
                f"compression method: {method} not found in {self.__class__.__name__}"
            )
        
        return method() 

    # protected methods for metadata removal and compression
    def _remove_metadata(self, target_image: vips.Image):
        for metadata_key, pattern in self.image_garbage_metadata.items():
            for field in target_image.get_fields():
                if regex.match(pattern, field):
                    target_image.remove(field)
        return target_image
    
    def _compress_jpeg(self) -> bytes:
        image_buffer = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        # autorot() bakes the orientation into the image, so we don't need to worry about it later. after this we can remove the orientation metadata from the image.
        # can we have a o(1) approach to remove metadata from the image? or we have to iterate over the metadata fields and remove them one by one?
        # for now, we'll iterate over the metadata fields and remove them one by one.
        targetImage = self._remove_metadata(image_buffer)

        targetImage = targetImage.jpegsave_buffer(
            Q=max(0, min(round(self.ratio * 100), 100)),
            trellis_quant=True,
            overshoot_deringing=True,
            optimize_coding=True,
            optimize_scans=True,
            interlace=True,
            subsample_mode="on"
        )
        return targetImage

    def _compress_png(self) -> bytes:
        image_buffer = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        target_image = self._remove_metadata(image_buffer)
        
        target_image = target_image.pngsave_buffer(
            Q=max(0, min(round(self.ratio * 100), 100)),
            interlace=True,
            palette=True
        )   

        # Convert the compressed bytes back to a vips.Image
        return target_image

    def _compress_webp(self) -> bytes:
        image_buffer = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        target_image = self._remove_metadata(image_buffer)

        target_image = target_image.webpsave_buffer(
            Q=max(0, min(round(self.ratio * 100), 100)),
            lossless=False,
            effort=4
        )

        return target_image

class CustomSize(ImageService):
    """
    CustomSize dynamically calculates adjustment factors (dimension scaling and quality factor Q)
    to achieve a desired target file size in bytes using an optimized BPP heuristic and binary search.
    """
    codec_bpp_heuristic: dict[str, float] = {
        "jpeg": 0.8,
        "jpg": 0.8,
        "webp": 0.65,
        "png": 1.8
    }

    def __init__(
        self,
        image,
        filetype: str,
        target_size: int,
        tolerance: float = 0.05,
        max_iterations: int = 6,
        ratio: float = 0.8
    ):
        super().__init__(image, filetype, ratio=ratio)
        if target_size <= 0:
            raise ValueError(f"target_size must be a positive integer in bytes, got: {target_size}")
        self.target_size = target_size
        self.tolerance = tolerance
        self.max_iterations = max_iterations
        self.calculated_scale: float = 1.0
        self.calculated_quality: int = 80

    def _encode_trial(self, img: vips.Image, q: int) -> bytes:
        ft = self.filetype.lower()
        if ft in ("jpeg", "jpg"):
            return img.jpegsave_buffer(
                Q=q,
                trellis_quant=True,
                overshoot_deringing=True,
                optimize_coding=True,
                optimize_scans=True,
                interlace=True,
                subsample_mode="on"
            )
        elif ft == "webp":
            return img.webpsave_buffer(
                Q=q,
                lossless=False,
                effort=4,
                min_size=True
            )
        elif ft == "png":
            return img.pngsave_buffer(
                Q=q,
                interlace=True,
                palette=True,
                compression=9
            )
        raise ValueError(f"Unsupported file type: {self.filetype}")

    @property
    def compress(self) -> bytes:
        if self.filetype not in self.supported_filetypes:
            raise ValueError(
                f"Unsupported file type: {self.filetype}. Supported file types are: {', '.join(self.supported_filetypes)}"
            )

        if hasattr(self.image, "getvalue"):
            raw_bytes = self.image.getvalue()
        elif isinstance(self.image, bytes):
            raw_bytes = self.image
        else:
            raw_bytes = bytes(self.image)

        image_buffer = vips.Image.new_from_buffer(raw_bytes, "").autorot()
        target_image = self._remove_metadata(image_buffer)

        orig_w = target_image.width
        orig_h = target_image.height
        orig_pixels = orig_w * orig_h

        desired_bpp = self.codec_bpp_heuristic.get(self.filetype.lower(), 0.8)
        target_pixels = (self.target_size * 8) / desired_bpp

        # If pixel budget accommodates native resolution, or if native resolution at Q=50 fits, preserve scale at 1.0
        if target_pixels >= orig_pixels:
            scale = 1.0
            working_image = target_image
        else:
            buf_probe = self._encode_trial(target_image, 50)
            if len(buf_probe) <= self.target_size:
                scale = 1.0
                working_image = target_image
            else:
                scale = min(1.0, math.sqrt(target_pixels / orig_pixels))
                min_dim = min(orig_w * scale, orig_h * scale)
                if min_dim < 16:
                    scale = max(16.0 / orig_w, 16.0 / orig_h)
                working_image = target_image.resize(scale)

        best_buf: bytes | None = None
        smallest_buf: bytes | None = None
        smallest_sz = float("inf")

        low_q, high_q = 15, 95

        for _ in range(self.max_iterations):
            mid_q = (low_q + high_q) // 2
            trial_buf = self._encode_trial(working_image, mid_q)
            sz = len(trial_buf)

            if sz < smallest_sz:
                smallest_sz = sz
                smallest_buf = trial_buf

            if sz <= self.target_size:
                best_buf = trial_buf
                self.calculated_quality = mid_q
                if sz >= self.target_size * (1 - self.tolerance):
                    break
                low_q = mid_q + 1
            else:
                high_q = mid_q - 1

        # Fallback if image was exceptionally complex and could not fit under target_size at Q=15
        if best_buf is None and smallest_sz > self.target_size:
            reduction = math.sqrt(self.target_size / smallest_sz) * 0.92
            scale = max(0.01, scale * reduction)
            working_image = target_image.resize(scale)
            trial_buf = self._encode_trial(working_image, 35)
            if len(trial_buf) <= self.target_size:
                best_buf = trial_buf
                self.calculated_quality = 35
            else:
                best_buf = self._encode_trial(working_image, 15)
                self.calculated_quality = 15

        self.calculated_scale = scale
        self.ratio = self.calculated_quality / 100.0

        if best_buf is not None:
            return best_buf
        if smallest_buf is not None:
            return smallest_buf
        return self._encode_trial(working_image, 15)
