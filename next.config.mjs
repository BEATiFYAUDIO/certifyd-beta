/** @type {import('next').NextConfig} */
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
const appHost = (() => {
  try {
    return new URL(appUrl).host;
  } catch {
    return 'localhost:3000';
  }
})();
const allowedOrigins = new Set([appHost, 'localhost:3000', 'localhost:3001']);
if (process.env.VERCEL_URL) allowedOrigins.add(process.env.VERCEL_URL);
if (process.env.BETA_ACCEPT_ORIGIN) {
  try {
    allowedOrigins.add(new URL(process.env.BETA_ACCEPT_ORIGIN).host);
  } catch {
    // Environment validation handles malformed URLs at runtime.
  }
}

const nextConfig = {
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
  experimental: {
    serverActions: { allowedOrigins: Array.from(allowedOrigins) },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default nextConfig;
