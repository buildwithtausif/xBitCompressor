from flask import Flask
from routes.controller_routes import request_interceptor

server = Flask(__name__)

server.register_blueprint(main_router, url_prefix='/api/v1')


if __name__ == '__main__':
    server.run(host='0.0.0.0', port=2006, debug=True)