import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./cors";

const configured = "http://localhost:5173,https://split-app.vercel.app";

describe("CORS origin validation", () => {
  it("accepts the production and generated Vercel deployment origins", () => {
    expect(isAllowedOrigin("https://split-app.vercel.app", configured)).toBe(true);
    expect(isAllowedOrigin("https://split-o8xwcmjhy-itsyourpriyansu-4080s-projects.vercel.app", configured)).toBe(true);
  });

  it("accepts local development and rejects lookalike or insecure origins", () => {
    expect(isAllowedOrigin("http://localhost:5173", configured)).toBe(true);
    expect(isAllowedOrigin("https://split-app.vercel.app.attacker.example", configured)).toBe(false);
    expect(isAllowedOrigin("http://split-app.vercel.app", configured)).toBe(false);
  });
});
