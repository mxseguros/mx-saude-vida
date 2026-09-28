import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do MX SaúdeVida.
 *
 * O QUE ESTA SUÍTE COBRE: o limite de autenticação, as telas de erro, os
 * cabeçalhos de segurança e o manifest — tudo que se verifica com o aplicativo
 * de pé e **sem banco de dados**. É pouco em quantidade e é a parte que mais
 * dói errar: uma rota protegida que deixa de proteger não dá erro em lugar
 * nenhum.
 *
 * O caminho que escreve no banco (cadastrar cliente, enviar planilha, conferir,
 * anexar boleto) é provado contra o ambiente publicado, pelos scripts de
 * `provas/`.
 *
 * `webServer` sobe o build de produção, não o `next dev`: é o que a Vercel
 * serve, e é onde o middleware roda como vai rodar de verdade.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,

  // Nada de `.only` esquecido barrando o CI silenciosamente.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? "line" : "list",

  use: {
    baseURL: process.env.URL_E2E ?? "http://localhost:3210",
    trace: "on-first-retry",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // O celular não é variação de tela: é onde a sidebar some e o menu passa a
    // ser a única navegação. Merece rodar de verdade.
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    command: "corepack pnpm build && corepack pnpm start --port 3210",
    url: "http://localhost:3210/entrar",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
