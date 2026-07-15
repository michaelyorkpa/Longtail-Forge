# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5
FROM ${NODE_IMAGE}

ARG LTF_RUNTIME_ARTIFACT
ARG LTF_APP_VERSION=unknown

LABEL org.opencontainers.image.title="Longtail Forge" \
      org.opencontainers.image.version="${LTF_APP_VERSION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8001 \
    LONGTAIL_DATA_DIR=/var/lib/longtail-forge \
    LONGTAIL_DATABASE_FILE=/var/lib/longtail-forge/longtail-forge.db \
    LONGTAIL_LOCAL_STORAGE_ROOT=/var/lib/longtail-forge/files

WORKDIR /opt/longtail-forge

RUN groupadd --gid 10001 longtail-forge \
    && useradd --uid 10001 --gid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin longtail-forge \
    && mkdir -p /var/lib/longtail-forge /var/backups/longtail-forge \
    && chown -R 10001:10001 /var/lib/longtail-forge /var/backups/longtail-forge \
    && chmod 0700 /var/lib/longtail-forge /var/backups/longtail-forge

COPY ${LTF_RUNTIME_ARTIFACT} /tmp/longtail-forge-runtime.tgz

RUN test -n "${LTF_RUNTIME_ARTIFACT}" \
    && tar -xzf /tmp/longtail-forge-runtime.tgz --strip-components=1 \
    && npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && rm /tmp/longtail-forge-runtime.tgz \
    && chown -R root:root /opt/longtail-forge \
    && chmod -R a-w /opt/longtail-forge

USER 10001:10001

EXPOSE 8001
VOLUME ["/var/lib/longtail-forge", "/var/backups/longtail-forge"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:8001/readyz',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"]

CMD ["node", "server.js"]
