# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
FROM ${NODE_IMAGE} AS runtime-build

ARG LTF_RUNTIME_ARTIFACT

WORKDIR /opt/longtail-forge

COPY ${LTF_RUNTIME_ARTIFACT} /tmp/longtail-forge-runtime.tgz

RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && test -n "${LTF_RUNTIME_ARTIFACT}" \
    && tar -xzf /tmp/longtail-forge-runtime.tgz --strip-components=1 \
    && npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /tmp/longtail-forge-runtime.tgz /var/lib/apt/lists/* \
    && chown -R root:root /opt/longtail-forge \
    && chmod -R a-w /opt/longtail-forge

# The complete runtime filesystem and configuration. The published image is this stage flattened into
# one layer by the `runtime` stage below; this stage is also the reference the image equivalence check
# compares that image against.
FROM ${NODE_IMAGE} AS runtime-filesystem

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

# Debian LTS security fixes that the pinned base predates, from bookworm-security: perl-base
# (DLA-4821-1), libpcre2-8-0 (DLA-4816-1), and tzdata (DLA-4792-1). Each already-installed package
# is upgraded to its exact fixed version and nothing new is installed; the build fails unless every
# installed version matches. A newer Debian fix, or a refreshed base, needs a reviewed change here.
RUN debian_security_updates="perl-base=5.36.0-7+deb12u4 libpcre2-8-0=10.42-1+deb12u2 tzdata=2026c-0+deb12u1" \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends --only-upgrade ${debian_security_updates} \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && for expected in ${debian_security_updates}; do installed="${expected%%=*}=$(dpkg-query -W -f='${Version}' "${expected%%=*}")"; if [ "$installed" != "$expected" ]; then echo "expected $expected, installed $installed" >&2; exit 1; fi; done

# The runtime never runs a package manager: dependencies are installed in the build stage, and the
# application, worker, backup, and public-demo tooling all run directly under node. Remove the base
# image's npm, npx, corepack, and yarn so their bundled packages are not shipped, and keep the system
# tar and gzip that archive creation, inspection, backup, and restore use.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && for tool in npm npx corepack yarn yarnpkg; do if command -v "$tool" >/dev/null 2>&1; then echo "$tool must be absent from the runtime image" >&2; exit 1; fi; done \
    && command -v tar >/dev/null && command -v gzip >/dev/null && command -v node >/dev/null \
    && groupadd --gid 10001 longtail-forge \
    && useradd --uid 10001 --gid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin longtail-forge \
    && mkdir -p /var/lib/longtail-forge /var/backups/longtail-forge \
    && chown -R 10001:10001 /var/lib/longtail-forge /var/backups/longtail-forge \
    && chmod 0700 /var/lib/longtail-forge /var/backups/longtail-forge

COPY --from=runtime-build /opt/longtail-forge /opt/longtail-forge

USER 10001:10001

EXPOSE 8001
VOLUME ["/var/lib/longtail-forge", "/var/backups/longtail-forge"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:8001/readyz',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"]

CMD ["node", "server.js"]

# The published runtime: exactly runtime-filesystem's files, copied as one filesystem layer that
# carries no whiteouts. BuildKit also records an empty layer for WORKDIR, which changes no file.
# Removing the base image's package managers in a later layer records whiteouts, and Docker storage
# that cannot apply them, like the preview host's, refuses to unpack the image. A scratch stage
# inherits nothing, so every effective setting of runtime-filesystem is restated here, including the
# base image's environment and ENTRYPOINT. The image equivalence check proves the filesystem and
# configuration identical, and image builds refuse any layer that contains a whiteout.
FROM scratch AS runtime

ARG LTF_APP_VERSION=unknown

COPY --from=runtime-filesystem / /

LABEL org.opencontainers.image.title="Longtail Forge" \
      org.opencontainers.image.version="${LTF_APP_VERSION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    NODE_VERSION=24.22.1 \
    YARN_VERSION=1.22.22 \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8001 \
    LONGTAIL_DATA_DIR=/var/lib/longtail-forge \
    LONGTAIL_DATABASE_FILE=/var/lib/longtail-forge/longtail-forge.db \
    LONGTAIL_LOCAL_STORAGE_ROOT=/var/lib/longtail-forge/files

WORKDIR /opt/longtail-forge

USER 10001:10001

EXPOSE 8001
VOLUME ["/var/lib/longtail-forge", "/var/backups/longtail-forge"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:8001/readyz',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
