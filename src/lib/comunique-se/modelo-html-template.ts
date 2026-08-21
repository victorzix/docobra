export interface DadosModeloHtml {
  referencia: string;
  projetoNome: string;
  itens: { descricao: string; concluida: boolean }[];
}

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function gerarHtmlModelo(dados: DadosModeloHtml): string {
  const itensHtml = dados.itens
    .map((item) => `<li class="${item.concluida ? "concluida" : ""}">${escapeHtml(item.descricao)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; font-size: 12pt; }
      h1 { font-size: 16pt; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1em; margin-bottom: 1.5em; }
      dt { font-weight: bold; }
      ul { padding-left: 1.2em; }
      li { margin-bottom: 0.5em; }
      li.concluida { text-decoration: line-through; color: #666; }
    </style>
  </head>
  <body>
    <h1>Checklist do Comunique-se</h1>
    <dl>
      <dt>Referência</dt><dd>${escapeHtml(dados.referencia)}</dd>
      <dt>Projeto</dt><dd>${escapeHtml(dados.projetoNome)}</dd>
    </dl>
    <ul>${itensHtml}</ul>
  </body>
</html>`;
}
