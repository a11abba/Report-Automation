import { afterEach, describe, expect, it } from "vitest";
import { getPdfRendererStatus } from "./pdf-renderer-status";

const originalVercel = process.env.VERCEL;

afterEach(() => {
  process.env.VERCEL = originalVercel;
});

describe("getPdfRendererStatus", () => {
  it("reports the bundled serverless renderer as ready on Vercel", () => {
    process.env.VERCEL = "1";

    expect(getPdfRendererStatus()).toEqual({
      available: true,
      message: "Serverless Chromium is ready.",
    });
  });
});
