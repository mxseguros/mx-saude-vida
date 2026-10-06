import { expect, test } from "@playwright/test";

/**
 * Fumaça: o que dá para provar sem banco de dados.
 *
 * Duas propriedades, e as duas falham em silêncio quando quebram — que é
 * exatamente por que merecem teste automatizado em vez de conferência manual:
 *
 *   1. Rota protegida sem sessão NÃO abre. Se o middleware parar de proteger,
 *      nada dá erro: a tela simplesmente carrega para quem não deveria vê-la.
 *   2. Endereço inexistente cai na nossa página, não na do Next em inglês.
 *
 * Rota nova entra AQUI e em `ROTAS_PROTEGIDAS` (middleware.ts), no mesmo
 * commit.
 */

const PROTEGIDAS = [
  "/controle",
  // Sob `/controle` o middleware ja protege por segmento; a prova fica porque
  // a tela mostra a relacao de vidas de uma empresa.
  "/controle/00000000-0000-0000-0000-000000000000/conferir",
  "/controle/00000000-0000-0000-0000-000000000000/coleta",
  "/alertas",
  "/clientes",
  "/clientes/novo",
  "/clientes/00000000-0000-0000-0000-000000000000/funcionarios",
  "/configuracoes",
];

test.describe("limite de autenticação", () => {
  for (const rota of PROTEGIDAS) {
    test(`${rota} exige sessão`, async ({ page }) => {
      await page.goto(rota);

      // A propriedade é "não entrou", e não "recebeu esta query": o destino
      // preservado é conveniência, a barreira é o que importa.
      await expect(page).toHaveURL(/\/entrar/);

      // A âncora é o CAMPO DE SENHA, não o título: teste que quebra por causa
      // de texto não está medindo a propriedade que diz medir.
      await expect(page.getByLabel(/senha/i)).toBeVisible();
    });
  }

  /**
   * A raiz só redireciona para o Controle, e o middleware barra antes de a
   * página rodar. Sem banco esta suíte faz a raiz cair em "indisponível", e
   * não em "sem sessão" — as duas mandam ao login, e é só isso que se prova
   * aqui.
   */
  test("a rota raiz não expõe nada sem sessão", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar/);
  });
});

/**
 * Conferir planilha abre o xlsx do cliente — nome, CPF e nascimento de cada
 * funcionario. As tres rotas exigem sessao.
 */
test.describe("conferir planilha", () => {
  const MES = "00000000-0000-0000-0000-000000000000";

  test("a previa das linhas exige sessão", async ({ request }) => {
    const resposta = await request.get(`/api/v1/controles/${MES}/previa`);
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("decidir a conferência exige sessão", async ({ request }) => {
    const resposta = await request.post(`/api/v1/controles/${MES}/conferir`, { data: { acao: "conferir" } });
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("baixar arquivo da equipe exige sessão", async ({ request }) => {
    const resposta = await request.get(`/api/v1/arquivos/${MES}`);
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("a recusa não conta nada sobre a planilha", async ({ request }) => {
    const corpo = await (await request.get(`/api/v1/controles/${MES}/previa`)).text();
    expect(corpo).not.toMatch(/cpf|nascimento|colaborador|vidas/i);
  });
});

/**
 * Anexar boleto grava valor a cobrar do cliente e sobe arquivo com dado
 * pessoal. As duas metades — ler o PDF e confirmar — exigem sessão.
 */
/**
 * Gerar o link de coleta e digitar a movimentação são da EQUIPE.
 *
 * O token é a credencial de quem vai informar as vidas de uma empresa. Se esta
 * guarda cair, qualquer pessoa gera um link para qualquer cliente — e um link
 * gerado é um link que a MX acha que mandou.
 */
test.describe("coleta pela equipe", () => {
  const MES = "00000000-0000-0000-0000-000000000000";

  test("gerar o link exige sessão", async ({ request }) => {
    const resposta = await request.put(`/api/v1/controles/${MES}/coleta`, {
      data: { nome: "Quem Tentou", celular: "55555555555" },
    });
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("digitar a movimentação exige sessão", async ({ request }) => {
    const resposta = await request.post(`/api/v1/controles/${MES}/coleta`, {
      data: { nome: "Quem Tentou", celular: "55555555555", semMovimentacao: true, entradas: [], saidas: [] },
    });
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("anexar a planilha exige sessão", async ({ request }) => {
    const resposta = await request.post(`/api/v1/controles/${MES}/planilha`, {
      multipart: { arquivo: { name: "p.xlsx", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") } },
    });
    expect([401, 503]).toContain(resposta.status());
  });

  test("a recusa não devolve token nenhum", async ({ request }) => {
    const resposta = await request.put(`/api/v1/controles/${MES}/coleta`, { data: { nome: "Quem Tentou" } });
    const corpo = await resposta.text();
    expect(corpo).not.toMatch(/coleta\/|token/i);
  });
});

/** Ler a apólice custa dinheiro e salvar grava contrato: as duas exigem sessão. */
test.describe("apólice do cliente", () => {
  const CLIENTE = "00000000-0000-0000-0000-000000000000";
  const pdf = { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") };

  test("ler o PDF exige sessão", async ({ request }) => {
    const resposta = await request.post(`/api/v1/clientes/${CLIENTE}/apolice/leitura`, { multipart: { arquivo: pdf } });
    expect([401, 503]).toContain(resposta.status());
  });

  test("salvar a apólice exige sessão", async ({ request }) => {
    const resposta = await request.put(`/api/v1/clientes/${CLIENTE}/apolice`, { multipart: { dados: "{}" } });
    expect([401, 503]).toContain(resposta.status());
  });
});

/** CPF, nascimento e salário de cada vida: tudo exige sessão. */
test.describe("funcionários", () => {
  const BASE = "/api/v1/clientes/00000000-0000-0000-0000-000000000000/funcionarios";
  const ID = "00000000-0000-0000-0000-000000000000";

  test("adicionar exige sessão", async ({ request }) => {
    expect([401, 503]).toContain((await request.post(BASE, { data: { nome: "Quem Tentou" } })).status());
  });
  test("editar exige sessão", async ({ request }) => {
    expect([401, 503]).toContain((await request.patch(`${BASE}/${ID}`, { data: { nome: "Quem Tentou" } })).status());
  });
  test("demitir exige sessão", async ({ request }) => {
    expect([401, 503]).toContain((await request.post(`${BASE}/${ID}/demissao`, { data: { saida: "01/01/2026" } })).status());
  });
  test("importar exige sessão", async ({ request }) => {
    const r = await request.post(`${BASE}/importacao`, {
      multipart: { arquivo: { name: "f.csv", mimeType: "text/csv", buffer: Buffer.from("nome;cpf") } },
    });
    expect([401, 503]).toContain(r.status());
  });
});

test.describe("anexar boleto", () => {
  const MES = "00000000-0000-0000-0000-000000000000";

  test("ler o PDF exige sessão", async ({ request }) => {
    const resposta = await request.put(`/api/v1/controles/${MES}/boleto`, {
      multipart: { arquivo: { name: "b.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") } },
    });
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("confirmar o boleto exige sessão", async ({ request }) => {
    const resposta = await request.post(`/api/v1/controles/${MES}/boleto`, {
      data: { arquivo: MES, valor: "R$ 1,00", vencimento: "2026-10-30" },
    });
    expect([401, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });
});

/**
 * A coleta por link é PÚBLICA, e isso é uma propriedade a provar.
 *
 * Se alguém puser `/coleta` em `ROTAS_PROTEGIDAS`, nada dá erro: a página passa
 * a mandar o gestor para uma tela de login que ele nunca vai conseguir usar —
 * ele não tem conta. O mês inteiro deixa de ser informado, e a MX descobre pelo
 * telefone, dias depois.
 *
 * Esta suíte roda SEM banco, então o token não resolve e a página cai na tela
 * de "link inválido". É o suficiente: o que se mede aqui é que ela RENDERIZA em
 * vez de redirecionar.
 */
test.describe("coleta por link", () => {
  const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDE";

  test("a página abre sem sessão", async ({ page }) => {
    await page.goto(`/coleta/${TOKEN}`);

    await expect(page).not.toHaveURL(/\/entrar/);
    // A âncora é o marco de página, não o texto: a tela varia entre inválido e
    // formulário conforme o banco responde, e as duas são a página certa.
    await expect(page.locator("main")).toBeVisible();
  });

  test("um só marco de página — dois confundem o leitor de tela", async ({ page }) => {
    await page.goto(`/coleta/${TOKEN}`);
    await expect(page.locator("main")).toHaveCount(1);
  });

  /**
   * Token inventado não pode contar nada. Quem varre endereços aprenderia pela
   * diferença entre as respostas quais tokens existem.
   */
  test("a recusa não conta nada sobre a empresa", async ({ page }) => {
    await page.goto(`/coleta/${TOKEN}`);
    const corpo = (await page.locator("body").textContent()) ?? "";
    expect(corpo).not.toMatch(/cnpj|razão social|competência|analista/i);
  });

  test("o envio exige um token que valha", async ({ request }) => {
    const resposta = await request.post(`/api/coleta/${TOKEN}`, {
      data: { nome: "Quem Tentou", celular: "55555555555", semMovimentacao: true, entradas: [], saidas: [] },
    });

    // 404 quando há banco e o token não existe; 503 nesta suíte, que roda sem
    // banco. As duas recusam, e nenhuma grava.
    expect([404, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  test("a planilha também exige o token", async ({ request }) => {
    const resposta = await request.post(`/api/coleta/${TOKEN}/planilha`, {
      multipart: {
        arquivo: { name: "p.xlsx", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") },
      },
    });
    expect([404, 503]).toContain(resposta.status());
    expect(resposta.ok()).toBe(false);
  });

  /**
   * Token com formato impossível é recusado ANTES do banco (`pareceToken`). A
   * rota é aberta na internet: `/coleta/` com 4 KB na URL não merece consulta.
   */
  test("token absurdo é recusado sem ir ao banco", async ({ request }) => {
    const resposta = await request.post(`/api/coleta/${"a".repeat(2000)}`, { data: {} });
    expect(resposta.status()).toBe(404);
  });
});

/**
 * O cron é uma porta aberta na internet com um segredo por fechadura, e roda
 * com a chave que ignora a RLS. Se a fechadura parar de fechar, nada acusa:
 * o job continua funcionando, só que para qualquer um que saiba a URL.
 */
test.describe("job mensal", () => {
  test("sem segredo no cabeçalho, não roda", async ({ request }) => {
    const resposta = await request.get("/api/cron/mensal");

    // 401 com o segredo configurado, 503 sem ele. As duas recusam; o que não
    // pode acontecer é 200.
    expect([401, 503]).toContain(resposta.status());
  });

  test("segredo errado não passa", async ({ request }) => {
    const resposta = await request.get("/api/cron/mensal", {
      headers: { authorization: "Bearer segredo-errado-de-proposito" },
    });
    expect([401, 503]).toContain(resposta.status());
  });

  test("a recusa não conta nada sobre clientes", async ({ request }) => {
    const resposta = await request.get("/api/cron/mensal");
    const corpo = await resposta.text();

    // O corpo da recusa não pode carregar contagem, nome nem competência: quem
    // bate na porta errada não fica sabendo o que há atrás dela.
    expect(corpo).not.toMatch(/competence|client|cliente|abertos|enviad/i);
  });
});

test.describe("telas de erro", () => {
  test("404 é a nossa página, em português", async ({ page }) => {
    const resposta = await page.goto("/rota-que-nao-existe");

    expect(resposta?.status()).toBe(404);
    await expect(page.getByText("Esta página não existe")).toBeVisible();
    await expect(page.getByRole("link", { name: /ir para o controle/i })).toBeVisible();

    // O texto do Next é em inglês e sem marca: se ele aparecer, o arquivo
    // not-found.tsx deixou de ser usado.
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
  });
});

test.describe("tela de entrada", () => {
  test("tem e-mail e senha", async ({ page }) => {
    await page.goto("/entrar");

    await expect(page.getByLabel(/e-mail/i).first()).toBeVisible();
    await expect(page.getByText(/senha/i).first()).toBeVisible();
  });

  test("destino hostil na query nao sobrevive ate a pagina", async ({ page }) => {
    // O formulario faz `router.replace(destino)`, e o roteador do Next aceita
    // URL absoluta: com o valor cru da query, a pessoa digitava a senha certa
    // e o navegador saia do site. A pagina nao pode conter o destino hostil em
    // nada que o navegador siga.
    await page.goto("/entrar?destino=https://evil.example/clone");

    // Checa ATRIBUTOS, nao o HTML inteiro: o payload do RSC ecoa a rota atual,
    // e isso e o Next registrando onde esta, nao o nosso codigo repassando.
    const acionaveis = await page.evaluate(() =>
      [...document.querySelectorAll("[value],[href],[action],[formaction]")]
        .flatMap((e) => ["value", "href", "action", "formaction"].map((a) => e.getAttribute(a)))
        .filter((v): v is string => typeof v === "string"),
    );

    expect(acionaveis.some((v) => v.includes("evil.example"))).toBe(false);
  });

  test("não é indexável", async ({ page }) => {
    await page.goto("/entrar");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("tem o favicon da MX, e ele abre sem sessão", async ({ page, request }) => {
    // O ícone vive em app/icon.png (o Next liga o <link> sozinho). O matcher
    // do middleware exclui .png e favicon.ico; se alguém apertar a regra, o
    // ícone passaria a redirecionar para /entrar e a aba ficaria sem marca.
    await page.goto("/entrar");
    const href = await page.locator('link[rel="icon"][type="image/png"]').getAttribute("href");
    expect(href).toMatch(/icon\.png/);
    const icone = await request.get(href!);
    expect(icone.status()).toBe(200);
    expect(icone.headers()["content-type"]).toContain("image/png");
    const ico = await request.get("/favicon.ico");
    expect(ico.status()).toBe(200);
    expect(ico.headers()["content-type"]).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
  });

  test("o corpo não rola na horizontal", async ({ page }) => {
    await page.goto("/entrar");

    const { largura, janela } = await page.evaluate(() => ({
      largura: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));

    // Rolagem horizontal na página inteira é sempre defeito de layout — o que
    // pode rolar de lado é um container, nunca o corpo.
    expect(largura).toBeLessThanOrEqual(janela + 1);
  });
});

/**
 * A tela de acesso encerrado.
 *
 * Ela existe para quebrar um LAÇO: o middleware chama de autenticado quem tem
 * sessão, sem olhar `profiles.active`. Quem teve o acesso revogado passaria
 * pelo middleware, a página veria perfil nulo e mandaria para /entrar, e o
 * middleware veria a sessão e mandaria de volta.
 *
 * Se `/sem-acesso` entrar em ROTAS_PROTEGIDAS, ou se alguém trocar o destino do
 * layout por "/entrar", nada dá erro — o laço simplesmente volta, para uma
 * pessoa só, que não consegue reportar.
 */
test.describe("acesso encerrado", () => {
  test("a tela abre sem sessao — e por isso quebra o laco", async ({ page }) => {
    const resposta = await page.goto("/sem-acesso");

    expect(resposta?.status()).toBe(200);
    await expect(page).toHaveURL(/\/sem-acesso/);
    await expect(page.getByRole("heading")).toContainText("acesso está encerrado");
  });

  test("oferece sair, que e o unico conserto possivel dali", async ({ page }) => {
    await page.goto("/sem-acesso");
    await expect(page.getByRole("button", { name: /sair desta conta/i })).toBeVisible();
  });
});

test.describe("cabeçalhos de segurança", () => {
  test("toda resposta leva os cabeçalhos que fecham a borda", async ({ request }) => {
    const resposta = await request.get("/entrar");
    const h = resposta.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    // Nenhuma tela usa localização: fica desligada até alguma precisar.
    expect(h["permissions-policy"]).toContain("geolocation=()");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("instalar no celular", () => {
  test("o manifest abre sem sessão, com nome, ícone e tela cheia", async ({ request }) => {
    // O navegador busca o manifest sem cookie: se o middleware o mandasse
    // para /entrar, o "Adicionar à Tela de Início" instalaria uma página de
    // login com nome vazio, sem ninguém ver erro.
    const resposta = await request.get("/manifest.webmanifest");
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("manifest");
    const corpo = await resposta.json();
    expect(corpo.name).toBe("MX SaúdeVida");
    expect(corpo.display).toBe("standalone");
    expect(corpo.icons.map((i: { src: string }) => i.src)).toContain("/icon.png");
    for (const icone of corpo.icons as { src: string }[]) {
      expect((await request.get(icone.src)).status(), icone.src).toBe(200);
    }
  });
});
