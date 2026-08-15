# Build the static site, then serve it from a distroless-ish runtime.
#
# Two stages so the image ships the built assets and nothing else: no source,
# no fixtures, no toolchain. The build is fully offline — it parses the
# committed snapshots, falling back to checked-in fixtures, rather than
# fetching anything — so the image is reproducible and needs no network at
# build time.

FROM oven/bun:1.3-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change reuses this layer.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json index.html serve.ts ./
COPY src ./src
COPY scripts ./scripts
COPY fixtures ./fixtures
# Whatever the last refresh committed. The directory always exists (it carries
# a README), so this cannot break a build made before the first refresh — it
# just leaves build:feed on the fixture fallback, which is what the image did
# before. Without it the container would serve fixture-era data while the site
# served fresh, with nothing to say why.
COPY snapshots ./snapshots
COPY test ./test

# Fail the image on a type error or a failing test rather than shipping it.
RUN bun run typecheck && bun test
RUN bun run build


FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Run unprivileged. The bun image ships a `bun` user; use it rather than root.
COPY --from=build --chown=bun:bun /app/public ./public
COPY --from=build --chown=bun:bun /app/serve.ts ./serve.ts
USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "await fetch('http://127.0.0.1:'+(process.env.PORT??3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)})"

CMD ["bun", "run", "serve.ts"]
