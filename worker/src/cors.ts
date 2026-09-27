export function isAllowedOrigin(origin: string | null, configuredOrigins: string): boolean {
  if (!origin) return false;
  const configured = configuredOrigins.split(",").map((item) => item.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}
