# Ship apps/web/public in the Docker image, so the marketing video and preview image load

**Change:** 063-public-assets-in-image · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `Dockerfile`, `.github/workflows/ci.yml` · **Depends on:** [062](../062-marketing-site/change.md)

## Problem

On the deployed site (Docker image behind Caddy), every file under `apps/web/public/` returns 404: the product video (MP4 and WebM), its poster, its captions and the Open Graph image. The page looks broken and the video never plays. The Dockerfile copies `.next/standalone` and `.next/static` but not `public/`, and Next's standalone output doesn't include it. Change 062 added the app's first `public/` files, and CI only smoke-tests `/healthz`, so nothing caught it.

## Mock Delta

No screen change. The marketing page's video, poster and share image load in production.

## Acceptance Criteria

1. **AC-1** The web image serves `apps/web/public`. `GET /marketing/amax-product.mp4` on the built image returns 200 with `content-type: video/mp4`, and a `Range: bytes=0-1023` request returns 206. The poster, captions, WebM and `amax-og.jpg` each return 200.
2. **AC-2** CI's `docker-k3s` job requests those files from the running container, after the `/healthz` check. The job fails if any of them is not 200 (or 206 for the range request), so a missing `public/` copy cannot ship again.
3. **AC-3** The image still starts and passes its health check, and the k3d smoke and restore drill still pass.

## Tasks

- [x] `T1` — Copy `apps/web/public` into the web image, and have CI's docker smoke check fetch the marketing media and the OG image from the running container (AC-1, AC-2, AC-3)
  Files: Dockerfile, .github/workflows/ci.yml

## Verify

Quality: not_run (Dockerfile and CI workflow only, no app code)
