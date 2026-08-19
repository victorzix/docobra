# Imagem única (build + runtime) — pensada pra homologação/Coolify, não pra
# tamanho mínimo de imagem. drizzle-kit (dependência de dev) precisa continuar
# disponível em tempo de execução pra aplicar o schema no start do container.
FROM node:22-slim

# Chromium do sistema pro Puppeteer: a imagem "slim" não tem as libs que o
# Chromium embutido do Puppeteer espera, então usamos o pacote do apt (que já
# resolve as dependências certas) em vez de baixar o Chromium do Puppeteer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

# Onde o app grava os PDFs/áudios gerados (src/lib/memorial/storage.ts) — sem
# volume aqui, cada novo deploy perde os arquivos anteriores.
VOLUME ["/app/storage"]

RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
