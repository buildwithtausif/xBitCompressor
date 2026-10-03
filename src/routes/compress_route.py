from flask import Blueprint, jsonify

request_interceptor = Blueprint('request_interceptor', __name__)


@request_interceptor.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'image-compressor'
    })


@request_interceptor.route('/status', methods=['GET'])
def status_check():
    return jsonify({
        'status': 'ready'
    })