#!/bin/sh
# Generate a self-signed certificate once (stored in the certs volume).
set -e
mkdir -p /certs
if [ ! -f /certs/brickbuddy.crt ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout /certs/brickbuddy.key -out /certs/brickbuddy.crt \
    -subj "/CN=brick-buddy.local" \
    -addext "subjectAltName=DNS:localhost,DNS:brick-buddy.local,IP:127.0.0.1${HOST_IP:+,IP:$HOST_IP}"
fi
