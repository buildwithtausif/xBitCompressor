from io import BytesIO
from services.image_service import ImageService
from flask import Response

class Compress_controller:
    @staticmethod
    def forward(image, ratio: float | None, filetype: str = "jpeg"):
        # Forward the image to the compression service
        # convert the bytes to a BytesIO object for processing
        image_stream: BytesIO = BytesIO(image)
        image_service: ImageService = ImageService(image_stream, filetype, ratio if ratio is not None else 0.8)
        data: bytes = image_service.compress_by_filetype
        return Response(
            data,
            mimetype=f"image/{filetype}",
            headers={"Content-Disposition": f"attachment; filename=compressed.{filetype}"},
        )