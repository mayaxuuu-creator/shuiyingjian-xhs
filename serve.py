# 本地开发服务器：带 no-cache 头（改代码后浏览器不会吃旧缓存）
# 用法：python3 serve.py [端口] （默认 8138，服务当前目录；打包 zip 时排除本文件）
import http.server
import socketserver
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8138


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', port), NoCacheHandler) as httpd:
    print(f'serving no-cache on {port}')
    httpd.serve_forever()
