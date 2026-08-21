const TAMANHO_CHUNK = 32_768;

export async function arrayBufferParaBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binario = "";

  for (let offset = 0; offset < bytes.length; offset += TAMANHO_CHUNK) {
    const chunk = bytes.subarray(offset, offset + TAMANHO_CHUNK);
    binario += String.fromCharCode(...chunk);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return btoa(binario);
}
