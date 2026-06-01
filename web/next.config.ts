import type { NextConfig } from "next";

// Backend service URLs used by Next.js to proxy browser requests. Defaults
// suit `next dev` on the host machine; in Docker compose these are passed
// in as build args (see web/Dockerfile + docker-compose.yml) so they get
// baked into the build:
//   - Local `next dev`     → localhost:3001 / localhost:9000
//   - Docker compose       → http://api:3001 / http://minio:9000
//
// Proxying via Next.js means the browser only ever talks to a single origin
// (the page's own host). That removes mixed-content issues when the app is
// reached over HTTPS (e.g. via the `make tunnel` localhost.run flow for
// mobile mic access), and removes the need for the browser to know the API
// or MinIO hostnames.
//
// NOTE: `rewrites()` runs at `next build` time and its destinations are
// serialized into `.next/routes-manifest.json`. Runtime env vars cannot
// override the manifest, which is why these must come from build args
// rather than the runtime `environment:` block.
const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
    const minioUrl = process.env.MINIO_INTERNAL_URL ?? "http://localhost:9000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        // MinIO serves objects at `/<bucket>/<key>`. Our bucket is `audio`,
        // so audio URLs look like `http://minio:9000/audio/<key>`. We expose
        // them under the same `/audio/...` path on the web origin.
        source: "/audio/:path*",
        destination: `${minioUrl}/audio/:path*`,
      },
    ];
  },
};

export default nextConfig;
