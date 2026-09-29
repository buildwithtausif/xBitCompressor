from flask import Blueprint, jsonify, request

pyvips_compressor_routes = Blueprint('pyvips_compressor_routes', __name__)


@pyvips_compressor_routes.route('/compress', methods=['POST'])
def compress_image():
    pass


@pyvips_compressor_routes.route('/compress/batch', methods=['POST'])
def compress_batch_images():
    pass