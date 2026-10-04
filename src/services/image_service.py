# import pyvips 

# class ImageService:
#     @staticmethod
#     def compress_image(image, filetype: str, ratio: float):
#         targetImage = core.Image.new_from_buffer(image.getvalue(), "", access="sequential")
#         return targetImage.write_to_buffer(
#             f".{filetype}", 
#             Q=ratio*100, 
#             interlace=True,
#             optimize_coding=True,
#             strip=True
#         )

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
import pyvips 
class ImageService:
    @staticmethod
    #ONLY FOR JPEG/JPG COMPRESSION 
    def compress_image(image, filetype: str, ratio: float = 0.3):
        """
        Args:
            image (BytesIO): The image to compress.
            filetype (str): The desired output file type (e.g., "jpeg", "png").
            ratio (float): The compression ratio between 0 and 1.

        Returns:
            bytes: The compressed image data.
        """

    # start writing from here
               
        data = image.getvalue()
        image = pyvips.Image.new_from_buffer(data ,"", access = "sequential")
        
        print(image.get_fields())

        #removing metadata for quality refining image

        REMOVABLE_METADATA = [
        "exif-data",
        "exif-ifd0-DateTime",
        "exif-ifd0-DateTimeOriginal",
        "exif-ifd0-DateTimeDigitized",
        "exif-ifd0-Make",
        "exif-ifd0-Model",
        "exif-ifd0-Software",
        "exif-ifd0-Artist",
        "exif-ifd0-Copyright",
        "exif-ifd0-ImageDescription",
        "exif-ifd0-Orientation",
        "exif-ifd0-XResolution",
        "exif-ifd0-YResolution",
        "exif-ifd0-ResolutionUnit",
        "exif-ifd0-HostComputer",
        "exif-ifd2-ExifVersion",
        "exif-ifd2-ExposureTime",
        "exif-ifd2-FNumber",
        "exif-ifd2-ExposureProgram",
        "exif-ifd2-ISOSpeedRatings",
        "exif-ifd2-ISOSpeed",
        "exif-ifd2-RecommendedExposureIndex",
        "exif-ifd2-ExposureBiasValue",
        "exif-ifd2-MeteringMode",
        "exif-ifd2-LightSource",
        "exif-ifd2-Flash",
        "exif-ifd2-FocalLength",
        "exif-ifd2-FocalLengthIn35mmFilm",
        "exif-ifd2-LensMake",
        "exif-ifd2-LensModel",
        "exif-ifd2-LensSerialNumber",
        "exif-ifd2-CameraOwnerName",
        "exif-ifd2-BodySerialNumber",
        "exif-ifd2-SerialNumber",
        "exif-ifd2-ColorSpace",
        "exif-ifd2-PixelXDimension",
        "exif-ifd2-PixelYDimension",
        "exif-ifd2-FlashpixVersion",
        "exif-ifd2-SceneCaptureType",
        "exif-ifd2-WhiteBalance",
        "exif-ifd2-DigitalZoomRatio",
        "exif-ifd2-Contrast",
        "exif-ifd2-Saturation",
        "exif-ifd2-Sharpness",
        "exif-ifd3-GPSLatitude",
        "exif-ifd3-GPSLatitudeRef",
        "exif-ifd3-GPSLongitude",
        "exif-ifd3-GPSLongitudeRef",
        "exif-ifd3-GPSAltitude",
        "exif-ifd3-GPSAltitudeRef",
        "exif-ifd3-GPSTimeStamp",
        "exif-ifd3-GPSDateStamp",
        "exif-ifd3-GPSSpeed",
        "exif-ifd3-GPSSpeedRef",
        "exif-ifd3-GPSDirection",
        "exif-ifd3-GPSDirectionRef",
        "exif-ifd3-GPSImgDirection",
        "exif-ifd3-GPSImgDirectionRef",
        "exif-ifd3-GPSMapDatum",
        "exif-ifd3-GPSProcessingMethod",
        "exif-ifd3-GPSAreaInformation",
        "xmp-data",
        "iptc-data",
        "photoshop-data",
        "jpeg-thumbnail-data",
        "thumbnail-data",
        "image-description",
        ]

        for fields in REMOVABLE_METADATA:
            if fields in image.get_fields():
                image.remove(fields)

        output = image.write_to_buffer(
        ".jpg",
        Q=ratio*100,
        optimize_coding=True,
        strip=True,
        subsample_mode="on"
        )
        print(image.get_fields())

        return output


    