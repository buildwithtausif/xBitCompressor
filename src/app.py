from flask import Flask
from routes.controller_routes import request_interceptor
from routes.pyvips_compressor_routes import pyvips_compressor_routes

server = Flask(__name__)

server.register_blueprint(request_interceptor, url_prefix='/api')
server.register_blueprint(pyvips_compressor_routes, url_prefix='/api')


if __name__ == '__main__':
    server.run(host='0.0.0.0', port=2006, debug=True)