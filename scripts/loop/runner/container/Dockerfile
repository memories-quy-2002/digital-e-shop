FROM node:24.20.0-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca

USER root
RUN apk add --no-cache git \
    && mkdir -p /usr/local/lib/loop-runner \
    && chown -R 65532:65532 /usr/local/lib/loop-runner
COPY --chown=65532:65532 entrypoint.mjs /usr/local/lib/loop-runner/entrypoint.mjs
RUN printf '#!/bin/sh\nexec node /usr/local/lib/loop-runner/entrypoint.mjs\n' > /usr/local/bin/loop-task-runner-v1 \
    && chmod 0555 /usr/local/bin/loop-task-runner-v1
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/loop-task-runner-v1"]
