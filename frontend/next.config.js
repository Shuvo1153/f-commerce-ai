const backendUrl = (process.env.BACKEND_URL || "http://localhost:3001").replace(/\/+$/, "");

module.exports = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};
