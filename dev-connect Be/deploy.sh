#!/usr/bin/env bash
#
# Build & push the DevConnect backend Docker image to Docker Hub.
# Run this whenever you've changed the backend and want to ship it.
#
#   ./deploy.sh            -> builds and pushes :latest and :<git-sha>
#   ./deploy.sh v1.2.0     -> also tags & pushes :v1.2.0
#
# Optional: export RENDER_DEPLOY_HOOK="https://api.render.com/deploy/srv-..."
# and this script will trigger a Render redeploy after pushing.

set -euo pipefail

IMAGE="imshivakumar/demo-deployment"

cd "$(dirname "$0")"

VERSION_TAG="${1:-}"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"

echo "==> Building ${IMAGE}:latest  (commit ${SHA})"
docker build -t "${IMAGE}:latest" -t "${IMAGE}:${SHA}" .

if [ -n "${VERSION_TAG}" ]; then
  docker tag "${IMAGE}:latest" "${IMAGE}:${VERSION_TAG}"
fi

echo "==> Pushing to Docker Hub"
docker push "${IMAGE}:latest"
docker push "${IMAGE}:${SHA}"
if [ -n "${VERSION_TAG}" ]; then
  docker push "${IMAGE}:${VERSION_TAG}"
fi

if [ -n "${RENDER_DEPLOY_HOOK:-}" ]; then
  echo "==> Triggering Render redeploy"
  curl -fsSL -X POST "${RENDER_DEPLOY_HOOK}" >/dev/null && echo "    ...deploy triggered"
fi

echo "==> Done. Pushed ${IMAGE}:latest and ${IMAGE}:${SHA}"
