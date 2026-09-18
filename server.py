#!/usr/bin/env python3
"""
FitCoach Casa - servidor estático local para desarrollo.

Sirve la app con cabeceras 'no-store' para que el navegador SIEMPRE cargue la
última versión (evita el problema de la caché al desarrollar).

La app funciona en local: el perfil y el progreso se guardan en el navegador
(localStorage). No necesita base de datos.

Uso:  python server.py   →  http://localhost:8000
"""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

PORT = int(os.environ.get("PORT", "8000"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


def main():
    handler = partial(Handler, directory=BASE_DIR)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    print("=" * 50)
    print(f"  FitCoach Casa  ->  http://localhost:{PORT}")
    print("  Servidor estático (sin caché). Datos locales en el navegador.")
    print("  Ctrl+C para detener.")
    print("=" * 50)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
