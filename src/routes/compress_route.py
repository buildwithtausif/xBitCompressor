import math
import logging
import gc
from flask import Blueprint, jsonify, request
from middleware.exception_handler import exception_handler
from controllers.compress_controller import Compress_controller

compress_route = Blueprint('request_interceptor', __name__)
compress_controller = Compress_controller()
logger = logging.getLogger(__name__)

def _validate_compression_params():
    """
    Validates query parameters (ratio 'r', desired size 's', allow_resize/resize, and to_jpeg/convert_to_jpeg).
    Returns (compression_ratio, desired_size, allow_resize, to_jpeg, error_response).
    If validation fails, error_response is a tuple (jsonify_response, status_code).
    """
    compression_ratio = request.args.get('r', type=float)
    desired_size = request.args.get('s', type=int)

    resize_param = request.args.get('allow_resize', request.args.get('resize'))
    allow_resize = resize_param.lower() in ('true', '1', 'yes') if resize_param is not None else True

    to_jpeg_param = request.args.get('to_jpeg', request.args.get('convert_to_jpeg'))
    to_jpeg = to_jpeg_param.lower() in ('true', '1', 'yes') if to_jpeg_param is not None else False

    if compression_ratio is not None and desired_size is not None:
        return None, None, True, False, (jsonify({
            "error": "Please provide either a compression ratio or a desired size, not both"
        }), 400)

    if desired_size is not None and desired_size <= 0:
        return None, None, True, False, (jsonify({
            "error": "Desired size must be greater than 0"
        }), 400)

    if compression_ratio is not None:
        if (
            math.isnan(compression_ratio)
            or math.isinf(compression_ratio)
            or compression_ratio < 0
            or compression_ratio > 1
        ):
            return None, None, True, False, (jsonify({
                "error": "Compression ratio must be between 0 and 1"
            }), 400)

    return compression_ratio, desired_size, allow_resize, to_jpeg, None


@compress_route.route('/compress', methods=['POST'])
def compress_image():
    payload_image = request.files.get('image')
    if payload_image is None:
        return jsonify({"error": "No image provided"}), 400
    image_bytes = payload_image.read()
        
    valid_image = exception_handler.handle_invalid_image(image_bytes)
    if not valid_image:
        return jsonify({
            "error": "MIME type not supported or image is corrupted"
        }), 400

    compression_ratio, desired_size, allow_resize, to_jpeg, error = _validate_compression_params()
    if error:
        return error

    try:
        new_image = compress_controller.forward(
            image=image_bytes, 
            ratio=compression_ratio, 
            desired_size=desired_size,
            filetype=valid_image[1],
            allow_resize=allow_resize,
            to_jpeg=to_jpeg
        )
        return new_image
    except Exception as e:
        logger.error(f"Compression error: {e}", exc_info=True)
        return jsonify({
            "error": "Failed to compress image"
        }), 500
    finally:
        is_large = len(image_bytes) > 5 * 1024 * 1024
        del image_bytes
        if is_large:
            gc.collect()


@compress_route.route('/estimate', methods=['POST'])
def estimate_size():
    payload_image = request.files.get('image')
    if payload_image is None:
        return jsonify({"error": "No image provided"}), 400
    image_bytes = payload_image.read()

    valid_image = exception_handler.handle_invalid_image(image_bytes)
    if not valid_image:
        return jsonify({
            "error": "MIME type not supported or image is corrupted"
        }), 400

    compression_ratio, desired_size, allow_resize, to_jpeg, error = _validate_compression_params()
    if error:
        return error

    try:
        estimated_bytes = compress_controller.estimate(
            image=image_bytes,
            ratio=compression_ratio,
            desired_size=desired_size,
            filetype=valid_image[1],
            allow_resize=allow_resize,
            to_jpeg=to_jpeg
        )
        return jsonify({"estimated_bytes": estimated_bytes})
    except Exception as e:
        logger.error(f"Estimation error: {e}", exc_info=True)
        return jsonify({
            "error": "Failed to calculate image estimate"
        }), 500
    finally:
        is_large = len(image_bytes) > 5 * 1024 * 1024
        del image_bytes
        if is_large:
            gc.collect()
