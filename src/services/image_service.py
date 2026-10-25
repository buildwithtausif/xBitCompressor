import pyvips as vips
import re as regex

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
        "comment":r".*(?:comment|description|caption).*",
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
            "jpeg": self.__compress_jpeg,
            "jpg": self.__compress_jpeg,
            "png": self.__compress_png,
            "webp": self.__compress_webp
        }

        method = dispatch_table.get(self.filetype.lower())

        if not callable(method):
            raise AttributeError(
                f"compression method: {method} not found in {self.__class__.__name__}"
            )
        
        return method() 

    # protected or name mangled methods for each filetype compression
    def __remove_metadata(self, target_image: vips.Image):
        for metadata_key, pattern in self.image_garbage_metadata.items():
            for field in target_image.get_fields():
                if regex.match(pattern, field):
                    target_image.remove(field)
        return target_image
    
    def __compress_jpeg(self) -> bytes:
        image_buffer = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        # autorot() bakes the orientation into the image, so we don't need to worry about it later. after this we can remove the orientation metadata from the image.
        # can we have a o(1) approach to remove metadata from the image? or we have to iterate over the metadata fields and remove them one by one?
        # for now, we'll iterate over the metadata fields and remove them one by one.
        targetImage = self.__remove_metadata(image_buffer)

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

    def __compress_png(self) -> bytes:
        image_buffer = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        target_image = self.__remove_metadata(image_buffer)
        
        target_image = target_image.pngsave_buffer(
            Q=max(0, min(round(self.ratio * 100), 100)),
            interlace=True,
            palette=True
        )   

        # Convert the compressed bytes back to a vips.Image
        return target_image

    def __compress_webp(self) -> bytes:
        image_buffer = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        target_image = self.__remove_metadata(image_buffer)

        target_image = target_image.webpsave_buffer(
            Q=max(0, min(round(self.ratio * 100), 100)),
            lossless=False,
            effort=4
        )

        return target_image