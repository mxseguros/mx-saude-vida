# -*- coding: utf-8 -*-
"""Gera a imagem de preview do link da coleta (Open Graph).

É a imagem que o WhatsApp mostra no topo da mensagem quando a analista manda
o formulário para o segurado. O `wa.me` só transporta texto: o card com imagem
é o preview que o WhatsApp monta buscando a página e lendo as meta tags.

Gerada, não desenhada — mesma regra do favicon (`gerar-favicon.py`). O lockup
branco vem de `public/mx-lockup-branco.png` e é composto sobre o navy da marca.

NÃO leva nome, número de ticket nem nada do segurado: o preview aparece na
conversa e pode ser encaminhado adiante, e quem o vir não precisa ser quem
recebeu o link.

    python scripts/gerar-og.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[1]
PUBLICO = RAIZ / "apps" / "web" / "public"

# 1200x630 é a proporção que o WhatsApp, o Telegram e o iMessage recortam sem
# cortar nada. Menor do que isso, alguns clientes mostram só a miniatura
# quadrada e o lockup fica ilegível.
LARGURA, ALTURA = 1200, 630
NAVY = (7, 27, 52)
BRANCO = (255, 255, 255)
# O mesmo sage do sistema, para a linha de apoio não competir com o lockup.
SAGE = (203, 209, 191)


def fonte(tamanho: int, negrito: bool = False):
    """A fonte do sistema; se não houver, a padrão — o texto é secundário."""
    nomes = (
        ["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
        if negrito
        else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
    )
    for nome in nomes:
        try:
            return ImageFont.truetype(nome, tamanho)
        except OSError:
            continue
    return ImageFont.load_default()


def centralizar(desenho, texto, y, fonte_usada, cor):
    caixa = desenho.textbbox((0, 0), texto, font=fonte_usada)
    desenho.text(((LARGURA - (caixa[2] - caixa[0])) / 2, y), texto, font=fonte_usada, fill=cor)


# O cartão do link de coleta (07/10): o preview que o WhatsApp mostra no topo
# da mensagem. Nada do cliente — a imagem é a mesma para todos.
IMAGENS = [
    ("og-coleta.png", "Movimentação do mês", "Leva menos de dois minutos"),
]


def gerar(arquivo: str, titulo: str, apoio: str) -> None:
    lockup = Image.open(PUBLICO / "mx-lockup-branco.png").convert("RGBA")

    tela = Image.new("RGB", (LARGURA, ALTURA), NAVY)

    # O lockup ocupa 46% da largura: maior do que isso e ele encosta nas bordas
    # do recorte quadrado que alguns clientes fazem.
    alvo = int(LARGURA * 0.46)
    escala = alvo / lockup.width
    lockup = lockup.resize((alvo, int(lockup.height * escala)), Image.LANCZOS)
    tela.paste(lockup, ((LARGURA - lockup.width) // 2, 168), lockup)

    desenho = ImageDraw.Draw(tela)
    centralizar(desenho, titulo, 344, fonte(46, negrito=True), BRANCO)
    centralizar(desenho, apoio, 412, fonte(30), SAGE)

    # Um filete no rodapé, no sage da marca: dá acabamento sem texto a mais.
    desenho.rectangle([(0, ALTURA - 10), (LARGURA, ALTURA)], fill=SAGE)

    destino = PUBLICO / arquivo
    # `optimize` derruba o arquivo para ~30 kB. O WhatsApp ignora preview acima
    # de 600 kB e mostra o link cru — sem aviso nenhum.
    tela.save(destino, "PNG", optimize=True)
    print(f"{destino.relative_to(RAIZ)}  {destino.stat().st_size // 1024} kB  {LARGURA}x{ALTURA}")


def main() -> None:
    for arquivo, titulo, apoio in IMAGENS:
        gerar(arquivo, titulo, apoio)


if __name__ == "__main__":
    main()
