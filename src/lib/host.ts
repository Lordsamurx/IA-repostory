/**
 * Onde as regras de negócio estão rodando.
 *
 * - "browser": a interface do CRM. Com o servidor de automação ligado, o navegador
 *   não executa chatbot, IA, follow-ups nem disparos (o servidor faz isso 24 h).
 * - "server": o worker do servidor (src/worker), que roda o mesmo código sem tela.
 */
import { serverHealth } from './api';

export const host = {
  server: false,
};

/** O servidor está executando as automações? */
export async function serverRunsAutomation(): Promise<boolean> {
  if (host.server) return true;
  return Boolean((await serverHealth())?.automation);
}
