from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from routes.compress_route import compress_route
import pyvips

# Disable libvips operation cache to prevent stale image buffers from accumulating in memory
pyvips.cache_set_max(0)
pyvips.cache_set_max_mem(0)
pyvips.cache_set_max_files(0)

server = Flask(__name__)

# Enforce 1 GB maximum payload size
server.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024

@server.errorhandler(RequestEntityTooLarge)
@server.errorhandler(413)
def handle_large_file(e):
    return jsonify({"error": "File exceeds maximum allowed size (1 GB)"}), 413

server.register_blueprint(compress_route, url_prefix='/api/v1')
CORS(
    server,
    resources={r"/api/v1/*": {"origins": "*"}}
)

if __name__ == '__main__':
    server.run(host='0.0.0.0', port=2006, debug=True)
