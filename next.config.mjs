/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Supabase Storage public URLs live on the project's *.supabase.co host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
