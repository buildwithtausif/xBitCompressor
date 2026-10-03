from flask import Flask
from routes.compress_route import compress_route

server = Flask(__name__)
server.register_blueprint(compress_route, url_prefix='/api/v1')


if __name__ == '__main__':
    server.run(host='0.0.0.0', port=2006, debug=True)