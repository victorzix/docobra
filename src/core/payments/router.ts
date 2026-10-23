import { FalhaIncertaError, RecusaDefinitivaError } from "./erros";
import type { CobrancaCriada, CriarCobrancaInput, PaymentProvider } from "./types";

export class PaymentRouter {
  constructor(private readonly providers: PaymentProvider[]) {
    if (providers.length === 0) {
      throw new Error("PaymentRouter precisa de ao menos um provider.");
    }
  }

  provider(nome: string): PaymentProvider {
    const encontrado = this.providers.find((candidato) => candidato.nome === nome);
    if (!encontrado) throw new Error(`Provider de pagamento desconhecido: "${nome}".`);
    return encontrado;
  }

  // Só a recusa definitiva autoriza tentar o próximo gateway: em falha incerta a
  // cobrança pode ter sido criada, e criar outra num segundo gateway cobraria duas vezes.
  async criarCobranca(
    input: Omit<CriarCobrancaInput, "clienteId">,
    resolverCliente: (provider: PaymentProvider) => Promise<string>,
  ): Promise<CobrancaCriada & { provider: string }> {
    let ultimaRecusa: RecusaDefinitivaError | null = null;

    for (const provider of this.providers) {
      try {
        const clienteId = await resolverCliente(provider);
        const criada = await provider.criarCobranca({ ...input, clienteId });
        return { ...criada, provider: provider.nome };
      } catch (erro) {
        if (erro instanceof RecusaDefinitivaError) {
          ultimaRecusa = erro;
          continue;
        }
        if (erro instanceof FalhaIncertaError) erro.provider = provider.nome;
        throw erro;
      }
    }

    throw ultimaRecusa as RecusaDefinitivaError;
  }
}
