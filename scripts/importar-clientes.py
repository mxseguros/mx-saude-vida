"""
Importa a lista de clientes do CONTROLE FATURAS_Base para o MX SaudeVida.

REGRA ZERO: este repositorio e PUBLICO. A planilha real fica em `Docs/`, que
esta no .gitignore, e este script NUNCA grava arquivo dentro do repositorio nem
imprime nome, CNPJ, e-mail ou telefone no terminal. O relatorio detalhado sai
num caminho que voce informa, fora do repo.

Escreve pela PostgREST com a sessao de um ADMIN — o mesmo caminho do
aplicativo, entao a RLS continua valendo. Nao usa a chave secreta.

Uso:
    # confere e nao escreve nada (padrao):
    python scripts/importar-clientes.py --planilha "Docs/CONTROLE FATURAS_Base.xlsx"

    # escreve, de verdade:
    python scripts/importar-clientes.py --planilha "..." --gravar

    # com relatorio linha a linha, fora do repo:
    python scripts/importar-clientes.py --planilha "..." --relatorio "C:/temp/relatorio.csv"

Variaveis de ambiente necessarias:
    SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, MX_EMAIL, MX_SENHA
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

# --------------------------------------------------------------------------
# Leiaute da planilha. Cabecalho na linha 3, dados da 4 em diante.
# --------------------------------------------------------------------------
COLUNAS = {
    "segurado": 2,
    "cnpj": 3,
    "cia": 4,
    "tipo": 5,
    "corte": 6,
    "venct": 7,
    "contato": 8,
    "obs": 11,
}
PRIMEIRA_LINHA = 4

# --------------------------------------------------------------------------
# TIPO -> `product` do banco
# --------------------------------------------------------------------------
PRODUTO = {
    "VIDA": "life",
    "VG": "group_life",
    "SAUDE": "health",
    "ODONTO": "dental",
    "GLOBAL": "global",
    "TRANSP": "transport",
}

# --------------------------------------------------------------------------
# CIA -> nome da seguradora como esta em `insurers`.
#
# So os casos em que a planilha escreve diferente do cadastro. O resto casa por
# comparacao sem acento e sem caixa.
# --------------------------------------------------------------------------
APELIDOS = {
    "TOKIO": "Tokio Marine",
    "SULAMERICA": "SulAmérica",
    "MEDSENIOR": "MedSênior",
    "GO CARE": "Go Care",
    "VERA CRUZ": "Vera Cruz",
}


def sem_acento(valor: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", valor) if unicodedata.category(c) != "Mn")


def chave(valor: str) -> str:
    return sem_acento(valor).upper().strip()


def digitos(valor: str) -> str:
    return re.sub(r"\D", "", valor)


def dia(valor: str) -> int | None:
    """O dia do mes, ou None quando a celula nao traz um."""
    if not re.fullmatch(r"\d{1,2}", valor):
        return None
    numero = int(valor)
    return numero if 1 <= numero <= 31 else None


EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def primeiro_email(valor: str) -> str | None:
    """
    O primeiro e-mail da celula.

    A coluna "E-MAIL" do Excel guarda de tudo: um e-mail, varios separados por
    virgula, "Nome - telefone", ou texto solto. Pegar o primeiro e-mail valido e
    o que da para fazer sem adivinhar qual dos tres e o do gestor.
    """
    achado = EMAIL.search(valor)
    return achado.group(0).lower() if achado else None


def primeiro_celular(valor: str) -> str | None:
    """Um celular brasileiro de 10 ou 11 digitos, quando a celula traz telefone."""
    for pedaco in re.findall(r"[\d\s()\-]{10,}", valor):
        numeros = digitos(pedaco)
        if len(numeros) in (10, 11):
            return numeros
    return None


# --------------------------------------------------------------------------
# Leitura
# --------------------------------------------------------------------------
def ler_planilha(caminho: str) -> list[dict]:
    try:
        import openpyxl
    except ImportError:
        sys.exit("Falta o openpyxl:  pip install openpyxl")

    aba = openpyxl.load_workbook(caminho, data_only=True).worksheets[0]
    linhas: list[dict] = []

    for numero, bruta in enumerate(aba.iter_rows(min_row=PRIMEIRA_LINHA, values_only=True), start=PRIMEIRA_LINHA):
        registro = {
            nome: ("" if bruta[indice - 1] is None else str(bruta[indice - 1]).strip())
            for nome, indice in COLUNAS.items()
        }

        if not registro["segurado"] and not registro["cnpj"]:
            continue

        # A planilha repete o cabecalho no meio da tabela.
        if registro["tipo"] == "Tipo" or registro["corte"] == "CORTE" or chave(registro["segurado"]) == "SEGURADO":
            continue

        registro["_linha"] = numero
        linhas.append(registro)

    return linhas


# --------------------------------------------------------------------------
# PostgREST
# --------------------------------------------------------------------------
class Banco:
    def __init__(self, url: str, chave_publicavel: str, token: str):
        self.url = url.rstrip("/")
        self.apikey = chave_publicavel
        self.token = token

    def _chamar(self, metodo: str, caminho: str, corpo=None, cabecalhos=None):
        dados = json.dumps(corpo).encode() if corpo is not None else None
        h = {
            "apikey": self.apikey,
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        if cabecalhos:
            h.update(cabecalhos)

        pedido = urllib.request.Request(f"{self.url}{caminho}", data=dados, headers=h, method=metodo)
        try:
            with urllib.request.urlopen(pedido) as resposta:
                texto = resposta.read().decode()
                return resposta.status, (json.loads(texto) if texto else None)
        except urllib.error.HTTPError as erro:
            return erro.code, erro.read().decode()

    def seguradoras(self) -> dict[str, int]:
        _, dados = self._chamar("GET", "/rest/v1/insurers?select=id,name&limit=200")
        return {chave(s["name"]): s["id"] for s in dados}

    def documentos_existentes(self) -> set[tuple[str, str]]:
        """Os pares (documento, ramo) que ja estao no banco."""
        _, dados = self._chamar("GET", "/rest/v1/clients?select=document,product&limit=2000")
        return {(c["document"], c["product"]) for c in dados}

    def criar_clientes(self, lote: list[dict]):
        return self._chamar("POST", "/rest/v1/clients", lote, {"Prefer": "return=representation"})


def entrar(url: str, chave_publicavel: str, email: str, senha: str) -> str:
    dados = json.dumps({"email": email, "password": senha}).encode()
    pedido = urllib.request.Request(
        f"{url.rstrip('/')}/auth/v1/token?grant_type=password",
        data=dados,
        headers={"apikey": chave_publicavel, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(pedido) as resposta:
            return json.loads(resposta.read().decode())["access_token"]
    except urllib.error.HTTPError as erro:
        sys.exit(f"Login falhou ({erro.code}). Confira MX_EMAIL e MX_SENHA.")


# --------------------------------------------------------------------------
# Mapeamento
# --------------------------------------------------------------------------
def mapear(
    linha: dict,
    seguradoras: dict[str, int],
    informar_antes: int,
    dia_do_boleto: int | None,
    boleto_antes: int | None,
    vencimento_padrao: int | None,
) -> tuple[dict | None, str | None]:
    """
    Devolve (cadastro, None) ou (None, motivo da recusa).

    A recusa e por linha e com motivo em texto: uma importacao que engole linha
    sem dizer qual deixa a MX descobrindo no mes seguinte que falta cliente.
    """
    documento = digitos(linha["cnpj"])
    if not documento:
        return None, "sem CNPJ/CPF"
    if len(documento) not in (11, 14):
        return None, f"documento com {len(documento)} digitos"

    vencimento = dia(linha["venct"])
    if vencimento is None:
        if vencimento_padrao is None:
            return None, f"sem dia de vencimento (celula: {linha['venct'] or 'vazia'!r})"
        # `-` e `D/C` querem dizer que a MX nao acompanha aquele pagamento. Entram
        # com o dia padrao e ficam MARCADOS na observacao, porque a data e
        # suposta: sem a marca, ninguem lembraria de conferir depois.
        vencimento = vencimento_padrao
        linha["_suposto"] = linha["venct"] or "vazia"

    corte = dia(linha["corte"])
    # `clients_movimentacao_inteira`: informar e corte vivem juntos ou nenhum dos
    # dois existe. Apolice sem movimentacao de vidas comeca direto no boleto.
    informar = None
    if corte is not None:
        informar = corte - informar_antes
        if informar < 1:
            # Dia 1 e 2 de corte nao tem como ter "informar" alguns dias antes no
            # mesmo mes: vale o dia 1, e a analista ajusta depois.
            informar = 1

    # O dia do boleto nao existe na planilha. Ou e um numero fixo para todos, ou
    # e derivado do vencimento — e derivado e o unico jeito de nao jogar o
    # vencimento de quem vence cedo para o mes seguinte.
    if boleto_antes is not None:
        boleto = max(1, vencimento - boleto_antes)
    else:
        boleto = dia_do_boleto

    produto = PRODUTO.get(chave(linha["tipo"]))
    if produto is None:
        if not linha["tipo"]:
            return None, "sem TIPO (ramo)"
        return None, f"TIPO desconhecido: {linha['tipo']!r}"

    nome_cia = chave(linha["cia"])
    seguradora = seguradoras.get(nome_cia) or seguradoras.get(chave(APELIDOS.get(nome_cia, "")))

    cadastro = {
        "legal_name": linha["segurado"],
        "document": documento,
        "product": produto,
        "insurer_id": seguradora,
        "inform_day": informar,
        "cutoff_day": corte,
        "invoice_day": boleto,
        "due_day": vencimento,
        "notes": observacao(linha),
    }

    email = primeiro_email(linha["contato"])
    celular = primeiro_celular(linha["contato"]) if not email else None

    # O canal precisa ter destino: `clients` nao obriga, mas o esquema da tela
    # obriga, e cadastro que a propria tela recusaria nao serve para nada.
    if email:
        cadastro["channel"] = "email"
        cadastro["manager_email"] = email
    elif celular:
        cadastro["channel"] = "whatsapp"
        cadastro["manager_phone"] = celular
    else:
        cadastro["channel"] = "email"

    return cadastro, None


AVISO_SUPOSTO = "[IMPORTACAO] vencimento suposto — a planilha trazia {0}. Conferir."


def observacao(linha: dict) -> str | None:
    """A observacao do Excel, com a marca de data suposta quando houver."""
    partes = []
    if linha.get("_suposto"):
        partes.append(AVISO_SUPOSTO.format(linha["_suposto"]))
    if linha["obs"]:
        partes.append(linha["obs"])
    return " · ".join(partes) or None


def principal() -> None:
    discussao = argparse.ArgumentParser(description="Importa clientes do CONTROLE FATURAS_Base.")
    discussao.add_argument("--planilha", required=True)
    discussao.add_argument("--gravar", action="store_true", help="Sem isto, so confere.")
    discussao.add_argument("--relatorio", help="CSV linha a linha. Use caminho FORA do repositorio.")
    discussao.add_argument(
        "--informar-antes",
        type=int,
        default=2,
        help="Quantos dias antes do corte o cliente e avisado (a planilha nao traz isto).",
    )
    grupo = discussao.add_mutually_exclusive_group(required=True)
    grupo.add_argument(
        "--dia-do-boleto",
        type=int,
        help="Um dia fixo de boleto para todos. Cuidado: quem vence ANTES dele tem o vencimento jogado ao mes seguinte.",
    )
    grupo.add_argument(
        "--boleto-antes",
        type=int,
        help="Dias ANTES do vencimento em que o boleto fica disponivel. Nenhum vencimento muda de mes.",
    )
    discussao.add_argument(
        "--vencimento-padrao",
        type=int,
        help="Dia de vencimento para as linhas que trazem '-', 'D/C' ou 'BOLETO'. Sem isto, elas ficam de fora.",
    )
    opcoes = discussao.parse_args()

    url = os.environ.get("SUPABASE_URL")
    publicavel = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    email = os.environ.get("MX_EMAIL")
    senha = os.environ.get("MX_SENHA")

    if not all((url, publicavel, email, senha)):
        sys.exit("Faltam SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, MX_EMAIL e MX_SENHA no ambiente.")

    linhas = ler_planilha(opcoes.planilha)
    print(f"linhas de dado na planilha: {len(linhas)}")

    token = entrar(url, publicavel, email, senha)
    banco = Banco(url, publicavel, token)
    seguradoras = banco.seguradoras()
    ja_existem = banco.documentos_existentes()
    print(f"seguradoras cadastradas: {len(seguradoras)}  ·  clientes ja no banco: {len(ja_existem)}")

    cadastros: list[dict] = []
    recusadas: list[tuple[int, str]] = []
    cias_sem_cadastro: collections.Counter[str] = collections.Counter()
    repetidos_na_planilha: list[tuple[int, str]] = []
    vistos: dict[tuple[str, str], int] = {}

    for linha in linhas:
        cadastro, motivo = mapear(
            linha,
            seguradoras,
            opcoes.informar_antes,
            opcoes.dia_do_boleto,
            opcoes.boleto_antes,
            opcoes.vencimento_padrao,
        )

        if motivo:
            recusadas.append((linha["_linha"], motivo))
            continue

        if cadastro["insurer_id"] is None and linha["cia"]:
            cias_sem_cadastro[linha["cia"]] += 1

        # A chave e (documento, RAMO): a mesma empresa com VIDA e SAUDE sao dois
        # cadastros, com datas proprias (`clients_documento_ramo_idx`). O que
        # continua barrado e o mesmo CNPJ no mesmo ramo.
        identidade = (cadastro["document"], cadastro["product"])

        if identidade in vistos:
            repetidos_na_planilha.append(
                (linha["_linha"], f"mesmo CNPJ e mesmo ramo da linha {vistos[identidade]}")
            )
            continue
        if identidade in ja_existem:
            recusadas.append((linha["_linha"], "este CNPJ neste ramo ja esta cadastrado"))
            continue

        vistos[identidade] = linha["_linha"]
        cadastros.append(cadastro)

    print(f"\nprontos para criar: {len(cadastros)}")
    print(f"recusados:          {len(recusadas)}")
    print(f"linha duplicada:    {len(repetidos_na_planilha)}  (mesmo CNPJ no mesmo ramo)")

    if recusadas:
        print("\nmotivos das recusas:")
        for motivo, quantas in collections.Counter(m for _, m in recusadas).most_common():
            print(f"  {quantas:>4}  {motivo}")

    # O dia do boleto e FIXO e o vencimento vem da planilha. Quando o vencimento
    # cai ANTES do boleto, `datasDaCompetencia` joga o vencimento para o mes
    # seguinte — correto pela regra, mas significa que o ciclo daquele cliente
    # anda um mes atrasado em relacao ao que a MX faz hoje. E a consequencia que
    # o relatorio precisa gritar antes de alguem gravar.
    rolam = [c for c in cadastros if c["due_day"] < c["invoice_day"]]
    if rolam:
        print("")
        print(
            f"ATENCAO: {len(rolam)} dos {len(cadastros)} cadastros tem vencimento ANTES "
            f"do dia do boleto."
        )
        print("  Nesses, o vencimento cai no MES SEGUINTE ao boleto. Se nao e o que a operacao faz,")
        print("  escolha um --dia-do-boleto menor, ou importe em dois lotes com dias diferentes.")
        faixas = collections.Counter(c["due_day"] for c in rolam)
        print("  dias de vencimento afetados:", dict(sorted(faixas.items())))

    if cias_sem_cadastro:
        print("\nseguradoras da planilha que NAO estao em `insurers` (o cliente entra sem seguradora):")
        for nome, quantas in cias_sem_cadastro.most_common():
            print(f"  {quantas:>4}  {nome}")

    if opcoes.relatorio:
        caminho = os.path.abspath(opcoes.relatorio)
        repo = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if caminho.startswith(repo):
            sys.exit(f"O relatorio tem nome de cliente dentro. Escolha um caminho FORA de {repo}.")

        with open(caminho, "w", encoding="utf-8-sig", newline="") as arquivo:
            escritor = csv.writer(arquivo, delimiter=";")
            escritor.writerow(["linha", "situacao", "detalhe", "nome", "documento", "produto", "corte", "vencimento"])
            for numero, motivo in sorted(recusadas + repetidos_na_planilha):
                bruta = next(l for l in linhas if l["_linha"] == numero)
                escritor.writerow([numero, "recusada", motivo, bruta["segurado"], bruta["cnpj"], bruta["tipo"], bruta["corte"], bruta["venct"]])
            for cadastro in cadastros:
                escritor.writerow(
                    ["", "criar", "", cadastro["legal_name"], cadastro["document"], cadastro["product"], cadastro["cutoff_day"], cadastro["due_day"]]
                )
        print(f"\nrelatorio: {caminho}")

    if not opcoes.gravar:
        print("\nNADA FOI GRAVADO. Rode de novo com --gravar quando o relatorio estiver certo.")
        return

    # Em lotes: um POST com 150 linhas que falha na ultima nao diz qual era.
    criados = 0
    for inicio in range(0, len(cadastros), 25):
        lote = cadastros[inicio : inicio + 25]
        status, resposta = banco.criar_clientes(lote)
        if status >= 300:
            print(f"\nlote {inicio // 25 + 1} recusado ({status}): {str(resposta)[:300]}")
            print(f"criados antes de parar: {criados}")
            sys.exit(1)
        criados += len(resposta or [])
        print(f"  lote {inicio // 25 + 1}: {len(resposta or [])} criados")

    print(f"\nclientes criados: {criados}")


if __name__ == "__main__":
    principal()
