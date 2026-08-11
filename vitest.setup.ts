import { config } from "dotenv";

config({ path: ".env.test", override: true });

if (!process.env.DATABASE_URL?.includes("docobra-local-test")) {
  throw new Error("Testes abortados: DATABASE_URL não aponta pro banco de teste.");
}
