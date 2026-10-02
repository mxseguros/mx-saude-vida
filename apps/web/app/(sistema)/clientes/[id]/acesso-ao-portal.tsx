"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/componentes/ui/avatar";
import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Modal } from "@/componentes/ui/modal";
import { emailValido, mascararEmail, mascararTelefone } from "@/lib/dominio/mascaras";
import { gerarSenha, problemaDaSenha } from "@/lib/dominio/senha";
import type { AcessoDoPortal } from "@/lib/clientes/acesso";

/**
 * Acesso ao portal, na ficha do cliente.
 *
 * É por aqui que um gestor passa a conseguir enviar a planilha pelo portal. Sem
 * esta seção o portal existia e ninguém alcançava: criar o acesso só dava por
 * SQL.
 *
 * A senha é definida aqui e entregue pela analista — o convite por e-mail
 * dependeria do gancho do Supabase, que ainda não está ligado, e convite que
 * falha calado é pior que nenhum convite. Ela aparece UMA vez, para copiar.
 */

/** Senha aleatória nasce no navegador: assim ela não trafega antes de precisar. */
function senhaAleatoria(): string {
  const bytes = new Uint32Array(32);
  crypto.getRandomValues(bytes);
  let i = 0;
  return gerarSenha((limite) => (bytes[i++ % bytes.length] ?? 0) % limite);
}

export function AcessoAoPortal({
  clienteId,
  acessos,
  nomeDoCliente,
  emailDoGestor,
  celularDoGestor,
  nomeDoGestor,
}: {
  clienteId: string;
  acessos: AcessoDoPortal[];
  nomeDoCliente: string;
  emailDoGestor: string | null;
  celularDoGestor: string | null;
  nomeDoGestor: string | null;
}) {
  const router = useRouter();

  const [abrindo, setAbrindo] = useState(false);
  // Pré-preenchido com o gestor do cadastro: é quase sempre a mesma pessoa, e
  // redigitar o e-mail é onde o erro de digitação entra.
  const [nome, setNome] = useState(nomeDoGestor ?? "");
  const [email, setEmail] = useState(emailDoGestor ?? "");
  const [telefone, setTelefone] = useState(celularDoGestor ?? "");
  const [senha, setSenha] = useState("");
  const [erroCampo, setErroCampo] = useState<{ campo: string; mensagem: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<AcessoDoPortal | null>(null);

  function limpar() {
    setNome(nomeDoGestor ?? "");
    setEmail(emailDoGestor ?? "");
    setTelefone(celularDoGestor ?? "");
    setSenha("");
    setErroCampo(null);
    setErro(null);
  }

  async function copiar(dados: { email: string; senha: string }) {
    try {
      await navigator.clipboard.writeText(
        `Portal do cliente — MX SaúdeVida\nEndereço: ${window.location.origin}/entrar\nE-mail: ${dados.email}\nSenha: ${dados.senha}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem clipboard: a senha está na tela */
    }
  }

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setErroCampo(null);

    const problema = problemaDaSenha(senha);
    if (problema) {
      setErroCampo({ campo: "senha", mensagem: problema });
      return;
    }
    setOcupado(true);

    try {
      const resposta = await fetch(`/api/v1/clientes/${clienteId}/acesso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, telefone, senha }),
      });
      const corpo = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        if (corpo?.error?.field) {
          setErroCampo({ campo: corpo.error.field, mensagem: corpo.error.message });
        }
        setErro(corpo?.error?.message ?? "Não foi possível criar o acesso.");
        return;
      }

      setCriada({ email: email.trim().toLowerCase(), senha });
      setAviso(`Acesso criado para ${nome.trim()}. Entregue a senha em mão — ela não é enviada por e-mail.`);
      setAbrindo(false);
      limpar();
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  async function mudar(usuarioId: string, corpo: Record<string, unknown>, queixa: string): Promise<boolean> {
    setErro(null);
    try {
      const resposta = await fetch(`/api/v1/clientes/${clienteId}/acesso/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        const json = await resposta.json().catch(() => null);
        setErro(json?.error?.message ?? queixa);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErro("Não foi possível falar com o servidor.");
      return false;
    }
  }

  async function trocarSenha() {
    if (!trocando) return;
    const nova = senhaAleatoria();
    const quem = trocando;
    setTrocando(null);

    const deu = await mudar(quem.id, { senha: nova }, "Não foi possível trocar a senha.");
    if (deu && quem.email) {
      setCriada({ email: quem.email, senha: nova });
      setAviso(`Senha nova para ${quem.nome}. A anterior deixou de valer.`);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">Acesso ao portal</h2>
        <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted">
          Com acesso, o gestor envia a planilha do mês pelo portal e baixa os boletos e a apólice. Sem acesso, a
          movimentação continua chegando por onde chega hoje.
        </p>
      </div>

      {acessos.length ? (
        <ul className="flex list-none flex-col gap-2">
          {acessos.map((acesso) => (
            <li
              key={acesso.id}
              className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-surface-2 p-3"
            >
              <Avatar iniciais={iniciais(acesso.nome)} nome={acesso.nome} />

              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] font-[600] ${acesso.ativo ? "text-heading" : "text-muted line-through"}`}>
                  {acesso.nome}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {acesso.email ?? "e-mail indisponível"}
                  {acesso.telefone ? ` · ${mascararTelefone(acesso.telefone)}` : ""}
                </span>
              </span>

              <span className={`text-[12.5px] font-[600] ${acesso.ativo ? "text-ok" : "text-muted"}`}>
                {acesso.ativo ? "Ativo" : "Sem acesso"}
              </span>

              <span className="inline-flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                <button
                  type="button"
                  onClick={() => setTrocando(acesso)}
                  className="text-heading underline underline-offset-2 hover:text-brand"
                >
                  Nova senha
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void mudar(
                      acesso.id,
                      { ativo: !acesso.ativo },
                      acesso.ativo ? "Não foi possível tirar o acesso." : "Não foi possível devolver o acesso.",
                    )
                  }
                  title={acesso.ativo ? "O histórico do que ele enviou fica" : undefined}
                  className={
                    acesso.ativo
                      ? "text-muted underline underline-offset-2 hover:text-heading"
                      : "text-ok underline underline-offset-2 hover:text-heading"
                  }
                >
                  {acesso.ativo ? "Tirar acesso" : "Reativar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-texto">
          Ninguém de {nomeDoCliente} tem acesso ao portal ainda.
        </p>
      )}

      {aviso ? (
        <p role="status" className="text-[13px] text-ok">
          {aviso}
        </p>
      ) : null}

      {/* A senha aparece UMA vez, para a analista copiar e entregar. Não volta na
          resposta da rota e não fica em lugar nenhum depois de fechar. */}
      {criada ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-brand bg-accent-soft px-3 py-2.5 text-[13px]">
          <span>
            <b className="font-[700] text-heading">{criada.email}</b> · senha{" "}
            <code className="tabular rounded-[4px] bg-surface px-1.5 py-0.5 font-[700] text-heading">
              {criada.senha}
            </code>
          </span>
          <Botao type="button" variante="secundario" onClick={() => void copiar(criada)}>
            {copiado ? "Copiado" : "Copiar acesso"}
          </Botao>
          <button
            type="button"
            onClick={() => setCriada(null)}
            className="text-[12.5px] text-muted underline underline-offset-2 hover:text-heading"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {erro && !abrindo ? (
        <p role="alert" className="text-[13px] text-bad">
          {erro}
        </p>
      ) : null}

      <div>
        <Botao
          type="button"
          variante={acessos.length ? "secundario" : "primario"}
          onClick={() => {
            limpar();
            setAbrindo(true);
          }}
        >
          {acessos.length ? "Dar acesso a outra pessoa" : "Criar acesso ao portal"}
        </Botao>
      </div>

      <Modal
        aberto={abrindo}
        titulo="Criar acesso ao portal"
        descricao={`Quem entra em nome de ${nomeDoCliente}. A senha é entregue por você; nada é enviado por e-mail.`}
        onFechar={() => setAbrindo(false)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setAbrindo(false)} disabled={ocupado}>
              Cancelar
            </Botao>
            <Botao
              onClick={(evento) => void criar(evento)}
              disabled={ocupado || !nome.trim() || !email.trim() || !senha}
            >
              {ocupado ? "Criando…" : "Criar acesso"}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Campo
            rotulo="Nome do gestor"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
          />

          <Campo
            rotulo="E-mail (é o login)"
            required
            type="email"
            inputMode="email"
            mascara={mascararEmail}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErroCampo(null);
            }}
            onBlur={() =>
              setErroCampo(
                email.trim() && !emailValido(email) ? { campo: "email", mensagem: "E-mail inválido." } : null,
              )
            }
            erro={erroCampo?.campo === "email" ? erroCampo.mensagem : null}
          />

          <Campo
            rotulo="Celular (opcional)"
            type="tel"
            inputMode="tel"
            mascara={mascararTelefone}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            dica="Só para a MX saber como chamar essa pessoa."
          />

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Campo
                rotulo="Senha"
                required
                type="text"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setErroCampo(null);
                }}
                onBlur={() => {
                  const problema = senha ? problemaDaSenha(senha) : null;
                  setErroCampo(problema ? { campo: "senha", mensagem: problema } : null);
                }}
                erro={erroCampo?.campo === "senha" ? erroCampo.mensagem : null}
                placeholder="10 ou mais, com letra e número"
              />
            </div>
            <Botao type="button" variante="secundario" onClick={() => setSenha(senhaAleatoria())}>
              Gerar
            </Botao>
          </div>

          {erro && abrindo && !erroCampo ? (
            <p role="alert" className="text-[12.5px] text-bad">
              {erro}
            </p>
          ) : null}

          <p className="text-[12.5px] leading-relaxed text-muted">
            O acesso nasce pronto: o gestor entra com este e-mail e esta senha, e pode trocá-la depois em “Esqueci a
            senha”. A senha aparece uma vez nesta tela, para você copiar.
          </p>
        </div>
      </Modal>

      <Modal
        aberto={trocando !== null}
        titulo={trocando ? `Nova senha para ${trocando.nome}` : ""}
        descricao="A senha atual deixa de valer na hora. A nova aparece uma vez, para você entregar."
        onFechar={() => setTrocando(null)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setTrocando(null)}>
              Cancelar
            </Botao>
            <Botao onClick={() => void trocarSenha()}>Gerar e trocar</Botao>
          </>
        }
      >
        <p className="text-[13px] text-muted">{trocando?.email ?? ""}</p>
      </Modal>
    </section>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return `${primeira}${ultima}`.toUpperCase() || "?";
}
