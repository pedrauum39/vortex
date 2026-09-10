import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default é 1 MB — pequeno demais pra foto de perfil do rep (enviarFotoRep).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
