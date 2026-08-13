export interface DadosMemorial {
  projetoNome: string;
  projetoEndereco: string | null;
  empresaNome: string;
  usuarioNome: string;
  tipoConstrucao: string;
  numeroPavimentos?: number;
  areaConstruida?: number;
  areaTerreno?: number;
  descricaoGeral: string;
  especificacoesTecnicas: string;
}

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function gerarHtmlMemorial(dados: DadosMemorial): string {
  const linhaEndereco = dados.projetoEndereco
    ? `<dt>Endereço</dt><dd>${escapeHtml(dados.projetoEndereco)}</dd>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 3cm 2cm 2cm 3cm; }
      body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.5; }
      h1 { text-align: center; font-size: 14pt; }
      h2 { font-size: 12pt; margin-top: 1.5em; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1em; }
      dt { font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>Memorial Descritivo</h1>
    <h2>Identificação da obra</h2>
    <dl>
      <dt>Projeto</dt><dd>${escapeHtml(dados.projetoNome)}</dd>
      ${linhaEndereco}
      <dt>Empresa</dt><dd>${escapeHtml(dados.empresaNome)}</dd>
      <dt>Responsável</dt><dd>${escapeHtml(dados.usuarioNome)}</dd>
      <dt>Tipo de construção</dt><dd>${escapeHtml(dados.tipoConstrucao)}</dd>
    </dl>
    <h2>Descrição geral</h2>
    <p>${escapeHtml(dados.descricaoGeral)}</p>
    <h2>Especificações técnicas</h2>
    <p>${escapeHtml(dados.especificacoesTecnicas)}</p>
  </body>
</html>`;
}
