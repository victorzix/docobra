import { describe, expect, it } from "vitest";

import { mascararDocumento, validarDocumento } from "../documento";

describe("validarDocumento", () => {
  it.each(["52998224725", "529.982.247-25", "12345678909", "11222333000181", "11.222.333/0001-81"])(
    "aceita %s",
    (documento) => {
      expect(validarDocumento(documento)).toBe(true);
    },
  );

  it.each([
    "",
    "123",
    "52998224724",
    "11222333000180",
    "12345678000199",
    "11111111111",
    "00000000000000",
    "abcdefghijk",
    "5299822472",
    "112223330001811",
  ])("recusa %j", (documento) => {
    expect(validarDocumento(documento)).toBe(false);
  });
});

describe("mascararDocumento", () => {
  it.each([
    ["", ""],
    ["123", "123"],
    ["1234", "123.4"],
    ["52998224725", "529.982.247-25"],
    ["529982247250", "52.998.224/7250"],
    ["11222333000181", "11.222.333/0001-81"],
    ["11.222.333/0001-81", "11.222.333/0001-81"],
    ["112223330001819999", "11.222.333/0001-81"],
    ["a1b2c3", "123"],
  ])("%j vira %j", (entrada, saida) => {
    expect(mascararDocumento(entrada)).toBe(saida);
  });
});
