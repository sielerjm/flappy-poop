#!/usr/bin/env python3
"""serve.py — serve the repo root and print laptop + phone URLs.

Created by Michael Sieler. Last updated: 2026-11-02.

Input:  none (serves the repository root).
Output: http.server on 0.0.0.0:8000; prints http://localhost:8000 and any
        LAN IPv4 as http://<ip>:8000 so a phone on the same Wi-Fi can connect.
        localhost on a phone is the phone itself, not this laptop.
"""
import http.server
import os
import socket
import socketserver
from pathlib import Path

PORT = 8000
HOST = "0.0.0.0"
ROOT = Path(__file__).resolve().parent.parent


def lan_ips():
    ips = []
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ip = probe.getsockname()[0]
        probe.close()
        if not ip.startswith("127."):
            ips.append(ip)
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    return ips


class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    os.chdir(ROOT)
    print(f"Laptop:  http://localhost:{PORT}")
    ips = lan_ips()
    if ips:
        for ip in ips:
            print(f"Phone:   http://{ip}:{PORT}  (same Wi-Fi; not localhost)")
    else:
        print("Phone:   could not detect a LAN IP; check System Settings > Wi-Fi")
    print("Ctrl-C to stop.")
    with ReuseTCPServer((HOST, PORT), http.server.SimpleHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()


if __name__ == "__main__":
    main()
