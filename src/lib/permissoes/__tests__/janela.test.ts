import { describe, expect, it } from "vitest";

import { MS_POR_DIA, calcularJanela } from "../janela";

const ANCORA = new Date("2026-03-01T00:00:00Z");
const depois = (dias: number) => new Date(ANCORA.getTime() + dias * MS_POR_DIA);

describe("calcularJanela", () => {
  it("no dia 0 a janela começa na âncora", () => {
    const janela = calcularJanela(ANCORA, 30, ANCORA);

    expect(janela.inicio).toEqual(ANCORA);
    expect(janela.fim).toEqual(depois(30));
  });

  it("dentro da primeira janela devolve a primeira janela", () => {
    const janela = calcularJanela(ANCORA, 30, depois(29));

    expect(janela.inicio).toEqual(ANCORA);
    expect(janela.fim).toEqual(depois(30));
  });

  it("exatamente na virada já é a janela seguinte", () => {
    const janela = calcularJanela(ANCORA, 30, depois(30));

    expect(janela.inicio).toEqual(depois(30));
    expect(janela.fim).toEqual(depois(60));
  });

  it("repete a janela várias vezes a partir da âncora", () => {
    const janela = calcularJanela(ANCORA, 30, depois(95));

    expect(janela.inicio).toEqual(depois(90));
    expect(janela.fim).toEqual(depois(120));
  });

  it("suporta janela de 360 dias", () => {
    const janela = calcularJanela(ANCORA, 360, depois(400));

    expect(janela.inicio).toEqual(depois(360));
    expect(janela.fim).toEqual(depois(720));
  });

  it("antes da âncora devolve a primeira janela", () => {
    const janela = calcularJanela(ANCORA, 30, depois(-5));

    expect(janela.inicio).toEqual(ANCORA);
    expect(janela.fim).toEqual(depois(30));
  });
});
