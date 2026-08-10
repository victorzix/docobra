import { describe, expect, it } from "vitest";

describe("ambiente de teste", () => {
  it("carrega o .env.test e aponta pro banco de teste, não pro de dev", () => {
    expect(process.env.DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toContain("docobra-local-test");
    expect(process.env.JWT_SECRET).toBeDefined();
  });
});
