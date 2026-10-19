# Brick Buddy backend: FastAPI + LDraw Nova (v0.6.0) + the official LDraw parts library
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends git curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

# LDraw Nova (AGPL-3.0): tools, example atlas and LDCad shadow data only (skips the 400 MB annotated set)
ARG LDRAW_NOVA_TAG=v0.6.0
RUN git clone --depth 1 --branch ${LDRAW_NOVA_TAG} --filter=blob:none --sparse https://github.com/anteloc/ldraw-nova.git /opt/ldraw-nova \
    && cd /opt/ldraw-nova \
    && git sparse-checkout set ldraw_tools examples/building-atlas examples/vehicle-atlas data/offLibShadow

# Official LDraw parts library (needed by LDraw Nova and by the browser's "real parts" view)
RUN curl -fsSL https://library.ldraw.org/library/updates/complete.zip -o /tmp/complete.zip \
    && unzip -q /tmp/complete.zip -d /opt \
    && rm /tmp/complete.zip

ENV LDRAW_DIR=/opt/ldraw \
    LDRAW_NOVA_DIR=/opt/ldraw-nova \
    BRICK_DATA_DIR=/data \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml ./
# Editable install keeps LDraw Nova's ROOT pointing at /opt/ldraw-nova (its data + cache live there)
RUN uv pip install --system -e /opt/ldraw-nova \
    && uv pip install --system -r pyproject.toml

COPY app ./app
VOLUME ["/data"]
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
