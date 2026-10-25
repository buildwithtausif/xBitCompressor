from io import BytesIO
from services.image_service import ImageService, CustomSize
from flask import Response
from faker import Faker

fake = Faker()
class Compress_controller:
    @staticmethod
    def forward(image, ratio: float | None, filetype: str, desired_size: int | None = None):
        # Forward the image to the compression service
        # convert the bytes to a BytesIO object for processing
        image_stream: BytesIO = BytesIO(image)
        if desired_size is not None:
            image_service = CustomSize(image_stream, filetype, target_size=desired_size)
        else:
            image_service = ImageService(image_stream, filetype, ratio if ratio is not None else 0.8)
            
        data: bytes = image_service.compress
        random_name = fake.uuid4()
        return Response(
            data,
            mimetype=f"image/{filetype}",
            headers={"Content-Disposition": f"attachment; filename={random_name}.{filetype}"},
        )