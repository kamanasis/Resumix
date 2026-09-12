let cachedApp: any = null;

async function getApp() {
  if (cachedApp) return cachedApp;
  process.env.SKIP_SERVER_LISTEN = "true";
  process.env.VERCEL = "1";
  try {
    const serverModule: any = await import("../dist/server.cjs");
    cachedApp = serverModule.default?.default || serverModule.default || serverModule;
  } catch (bundleErr) {
    const serverModule: any = await import("../server.ts");
    cachedApp = serverModule.default?.default || serverModule.default || serverModule;
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel serverless function bootstrap error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        code: "INTERNAL_SERVER_ERROR",
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Serverless function initialization error. Please ensure the application is built properly."
        },
        message: "Serverless function initialization error."
      });
    }
  }
}
