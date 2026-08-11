import { describe, expect, it } from "vitest";

import { ehItemAtivo } from "../sidebar";

describe("ehItemAtivo", () => {
  it("retorna true quando o pathname é exatamente o href", () => {
    expect(ehItemAtivo("/dashboard/memorial", "/dashboard/memorial")).toBe(true);
  });

  it("retorna true quando o pathname é uma sub-rota do href", () => {
    expect(ehItemAtivo("/dashboard/memorial/123", "/dashboard/memorial")).toBe(true);
  });

  it("retorna false quando o pathname é outra rota", () => {
    expect(ehItemAtivo("/dashboard/comunique-se", "/dashboard/memorial")).toBe(false);
  });

  it("retorna false quando o pathname só compartilha o prefixo textual sem ser sub-rota", () => {
    expect(ehItemAtivo("/dashboard/memorial-antigo", "/dashboard/memorial")).toBe(false);
  });
});
