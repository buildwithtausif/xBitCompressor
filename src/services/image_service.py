"""
NOTE FOR DEVELOPERS:
for the sake of convention name your class as ImageService and the method as compress_image.
and the above code is just a reference for you to 
implement the compress_image method using pyvips library.
the above code is very inefficient and will not work for large images, 
so please make sure to implement it in a way that it can handle large images efficiently.

expect:-
Image = binary buffer stream
Compression ratio = float between 0 and 1
Filetype = string representing the image format (e.g., "jpeg", "png") refer to the signatures in validate_image.py for supported formats.

recommendation:-

implement strip for better compression.
implement size compression as well were user enters size and image compresses accordingly

error in the above code on testing:-
Image of size 4Mb became of size > 7 Mb after compression with ratio 0.8 and filetype png.
"""
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
    # the use case of this attribute is to call the appropriate compression method based on the filetype of the image.
    @property
    def compress_by_filetype(self) -> bytes:
        if self.filetype not in self.supported_filetypes:
            raise ValueError(f"Unsupported file type: {self.filetype}. Supported file types are: {', '.join(self.supported_filetypes)}")
        # we've to call internal methods based on the filetype of the image.
        for filetype in self.supported_filetypes:
            if self.filetype == filetype:
                method_name = f"_ImageService__compress_{filetype}"
                method = getattr(self, method_name, None)

                if filetype in ("jpg", "jpeg"):
                    return self.__compress_jpeg()
                
                if not callable(method):
                    raise AttributeError(f"Method {method_name} not found in {self.__class__.__name__}")
                return method()

    # protected or name mangled methods for each filetype compression
    def __compress_jpeg(self) -> bytes:
        targetImage = vips.Image.new_from_buffer(self.image.getvalue(), "", access="sequential").autorot()
        # autorot() bakes the orientation into the image, so we don't need to worry about it later. after this we can remove the orientation metadata from the image.
        # can we have a o(1) approach to remove metadata from the image? or we have to iterate over the metadata fields and remove them one by one?
        # for now, we'll iterate over the metadata fields and remove them one by one.
        for metadata_key, pattern in self.image_garbage_metadata.items():
            for field in targetImage.get_fields():
                if regex.match(pattern, field):
                    targetImage.remove(field)
        targetImage = targetImage.jpegsave_buffer(
            Q=int(self.ratio * 100),
            trellis_quant=True,
            overshoot_deringing=True,
            optimize_coding=True,
            optimize_scans=True,
            interlace=True,
            subsample_mode="on"
        )
        return targetImage

    def __compress_png(self) -> bytes:
        pass

    def __compress_webp(self) -> bytes:
        pass