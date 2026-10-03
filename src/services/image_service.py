# import pyvips as core
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
import pyvips as core
class ImageService:
    @staticmethod
    def compress_image(image, filetype: str, ratio: float):
        """

        Args:
            image (BytesIO): The image to compress.
            filetype (str): The desired output file type (e.g., "jpeg", "png").
            ratio (float): The compression ratio between 0 and 1.

        Returns:
            bytes: The compressed image data.
        """

    # start writing from here
    