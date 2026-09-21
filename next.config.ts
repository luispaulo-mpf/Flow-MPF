import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: {
    // pdfjs-dist (used internally by pdf-parse) loads its worker via a
    // dynamically-computed path, so Vercel's file tracer misses it and
    // the deployed function is missing pdf.worker.mjs at runtime.
    "/**": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
  },
  experimental: {
    serverActions: {
      // Default is 1MB, too small for the ERP's "Listagem de Pedidos" PDF
      // reports; kept under Vercel's ~4.5MB serverless request body ceiling.
      bodySizeLimit: "4mb",
    },
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
