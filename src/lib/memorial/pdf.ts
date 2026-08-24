import puppeteer, { type Browser } from "puppeteer";

// Lançar o Chrome headless custa 1-3s por chamada -- mantemos uma única instância
// viva entre gerações (memorial e comunique-se) em vez de abrir/fechar a cada PDF.
let browserPromise: Promise<Browser> | null = null;

async function obterBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
  }

  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return obterBrowser();
  }

  return browser;
}

export async function gerarPdf(html: string): Promise<Buffer> {
  const browser = await obterBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "a4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
