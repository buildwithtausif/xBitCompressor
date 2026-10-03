from utils.validate_image import is_image

class exception_handler:
    @staticmethod
    def handle_invalid_image(image):
        if image is None:
            return False
        file_type, valid = is_image(image)
        if not valid:
            return False
        return True, file_type

    