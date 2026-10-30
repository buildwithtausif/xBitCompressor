from services.image_service import ImageService, CustomSize
from flask import Response
from faker import Faker

fake = Faker()

class Compress_controller:
    @staticmethod
    def forward(
        image: bytes,
        ratio: float | None,
        filetype: str,
        desired_size: int | None = None,
        allow_resize: bool = True,
        to_jpeg: bool = False
    ) -> Response:
        final_filetype = filetype
        if desired_size is not None:
            image_service = CustomSize(
                image,
                filetype,
                target_size=desired_size,
                allow_resize=allow_resize,
                to_jpeg=to_jpeg
            )
            final_filetype = getattr(image_service, "effective_filetype", filetype)
        else:
            image_service = ImageService(image, filetype, ratio if ratio is not None else 0.8)
            
        try:
            data: bytes = image_service.compress
        finally:
            image_service.cleanup()

        random_name = fake.uuid4()
        ext = "jpg" if final_filetype in ("jpeg", "jpg") else final_filetype
        return Response(
            data,
            mimetype=f"image/{final_filetype}",
            headers={"Content-Disposition": f"attachment; filename={random_name}.{ext}"},
        )

    @staticmethod
    def estimate(
        image: bytes,
        ratio: float | None,
        filetype: str,
        desired_size: int | None = None,
        allow_resize: bool = True,
        to_jpeg: bool = False
    ) -> int:
        """
        Calculates the estimated size in bytes without generating the HTTP download response.
        """
        if desired_size is not None:
            image_service = CustomSize(
                image,
                filetype,
                target_size=desired_size,
                allow_resize=allow_resize,
                to_jpeg=to_jpeg
            )
        else:
            image_service = ImageService(image, filetype, ratio if ratio is not None else 0.8)

        try:
            data: bytes = image_service.compress
            return len(data)
        finally:
            image_service.cleanup()
