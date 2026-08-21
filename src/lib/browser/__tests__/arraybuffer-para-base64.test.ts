import { describe, expect, it } from "vitest";

import { arrayBufferParaBase64 } from "../arraybuffer-para-base64";

describe("arrayBufferParaBase64", () => {
  it("codifica um buffer pequeno corretamente", async () => {
    const buffer = new TextEncoder().encode("Olá, DocObra!").buffer;

    const resultado = await arrayBufferParaBase64(buffer);

    expect(resultado).toBe(Buffer.from("Olá, DocObra!").toString("base64"));
  });

  it("codifica um buffer vazio como string vazia", async () => {
    const resultado = await arrayBufferParaBase64(new ArrayBuffer(0));

    expect(resultado).toBe("");
  });

  it("codifica um buffer maior que um chunk (32KB) sem perder bytes", async () => {
    const tamanho = 32_768 * 2 + 500; // atravessa 2 chunks inteiros + resto
    const bytes = new Uint8Array(tamanho);
    for (let i = 0; i < tamanho; i++) {
      bytes[i] = i % 256;
    }

    const resultado = await arrayBufferParaBase64(bytes.buffer);

    expect(resultado).toBe(Buffer.from(bytes).toString("base64"));
  });
});
