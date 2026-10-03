signatures = {
    "png": b"\x89PNG\r\n\x1a\n",
    "jpg": b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
    "gif": b"GIF8",
    "bmp": b"BM",
    "tiff": b"II*\x00",
    "tif": b"II*\x00",
    "ico": b"\x00\x00\x01\x00",
}

def is_image(image) -> tuple[str, bool]:
    """
    Verify if the given image bytes match any known image file signature.

    Args:
        image (bytes): The bytes of the image to verify.

    Returns:
        tuple[str, bool]: A tuple containing a string with the image format and a boolean indicating if the image is valid.
    """
    if image.startswith(b"RIFF") and len(image) >= 12 and image[8:12] == b"WEBP":
        return "webp", True

    if b"<svg" in image[:1024].lower():
        return "svg", True

    for file_type, signature in signatures.items():
        if image.startswith(signature):
            return file_type, True
    return "unknown", False