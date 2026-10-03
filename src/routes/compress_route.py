from flask import Blueprint, jsonify, request
from middleware.exception_handler import exception_handler
from controllers.compress_controller import Compress_controller
compress_route = Blueprint('request_interceptor', __name__)
compress_controller = Compress_controller()

@compress_route.route('/compress', methods=['POST'])
def compress_image():
    # getting the image from the request
    payload_image = request.files.get('image')
    if payload_image is None:
        return jsonify({"error": "No image provided"}), 400
    image_bytes = payload_image.read()
        
    valid_image = exception_handler.handle_invalid_image(image_bytes)
    if not valid_image:
        return jsonify({
                "error": "MIME type not supported or image is corrupted"
             }), 400

    compression_ratio = request.args.get('r', type=float)
    desired_size = request.args.get('s', type=int)

    if compression_ratio is not None and desired_size is not None:
        return jsonify({
             "error": "Please provide either a compression ratio or a desired size, not both"
             }), 400
    
    if compression_ratio is not None and (compression_ratio < 0 or compression_ratio > 1):
            return jsonify({
                "error": "Compression ratio must be between 0 and 1"
            }), 400
    try:
        # forward the image to the compression controller
        newImage = compress_controller.forward(image=image_bytes, ratio=compression_ratio, filetype=valid_image[1])
        return newImage
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500