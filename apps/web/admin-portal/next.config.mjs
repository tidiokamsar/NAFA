/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` emits a self-contained server bundle for the Docker runtime
  // stage. It is opt-in because the bundle contains symlinks, which Windows
  // refuses to copy into the Nx cache without the developer-mode privilege.
  // The Dockerfile and CI set NEXT_OUTPUT_STANDALONE=1.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1'
    ? { output: 'standalone' }
    : {}),
};

export default nextConfig;
