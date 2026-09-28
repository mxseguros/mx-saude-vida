"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/componentes/ui/avatar";
import { Botao } from "@/componentes/ui/botao";
import { Campo, Selecao } from "@/componentes/ui/campo";
import { Modal } from "@/componentes/ui/modal";
import { emailValido, mascararEmail } from "@/lib/dominio/mascaras";
import { gerarSenha, problemaDaSenha } from "@/lib/dominio/senha";
import { PAPEIS, ROTULO_PAPEL, type Papel } from "@/lib/dominio/tipos";
import type { PessoaEquipe } from "@/lib/configuracao/consulta";

/**
 * Usuários.
 *
 * Quem entra, com qual perfil, e quem deixa de ter acesso.
 *
 * Tirar acesso DESATIVA, não apaga: `control_events.actor_profile_id` aponta
 * para o perfil, e apagar a pessoa deixaria a linha do tempo com autor nulo
 * justamente nos meses de quem saiu — que é quando saber quem conferiu o quê
 * mais importa.
 */

const AJUDA_DO_PAPEL: Record<Papel, string> = {
  analista: "Opera o Controle: confere planilha, envia mensagem, anexa boleto.",
  leitura: "Consulta e baixa. Não altera nada.",
  admin: "Tudo isso, mais esta tela.",
};

/** Senha aleatória do navegador, que é onde ela precisa nascer: nunca trafega. */
function senhaAleatoria(): string {
  const bytes = new Uint32Array(32);
  crypto.getRandomValues(bytes);
  let i = 0;
  return gerarSenha((limite) => (bytes[i++ % bytes.length] ?? 0) % limite);
}

export function AbaEquipe({ equipe, euMesmo }: { equipe: PessoaEquipe[]; euMesmo: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("analista");
  const [senha, setSenha] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [criado, setCriado] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function gerar() {
    setSenha(senhaAleatoria());
    setErroSenha(null);
    setMostrarSenha(true);
  }

  async function copiar() {
    if (!criado) return;
    try {
      await navigator.clipboard.writeText(
        `Acesso ao MX SaúdeVida\nE-mail: ${criado.email}\nSenha: ${criado.senha}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem clipboard: a senha está na tela */
    }
  }

  async function criarAcesso(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);

    const problema = problemaDaSenha(senha);
    if (problema) {
      setErroSenha(problema);
      return;
    }
    setOcupado(true);

    try {
      const resposta = await fetch("/api/v1/configuracao/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nome, papel, senha }),
      });
      const corpo = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        if (corpo?.error?.field === "senha") setErroSenha(corpo.error.message);
        if (corpo?.error?.field === "email") setErroEmail(corpo.error.message);
        setErro(corpo?.error?.message ?? "Não foi possível criar o acesso.");
        return;
      }

      // A senha aparece UMA vez, aqui, para o administrador copiar e entregar.
      // Não volta na resposta nem fica em lugar nenhum depois de fechar.
      setCriado({ email: email.trim().toLowerCase(), senha });
      setAviso(`Acesso criado para ${nome.trim()}. Entregue a senha em mão; ela não é enviada por e-mail.`);
      setEmail("");
      setNome("");
      setSenha("");
      setMostrarSenha(false);
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  async function chamar(caminho: string, opcoes: RequestInit, queixa: string): Promise<boolean> {
    setErro(null);
    try {
      const resposta = await fetch(caminho, opcoes);
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.error?.message ?? queixa);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErro("Não foi possível falar com o servidor.");
      return false;
    }
  }

  const trocarPapel = (id: string, novo: Papel) =>
    chamar(
      `/api/v1/configuracao/equipe/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ papel: novo }) },
      "Não foi possível mudar o perfil.",
    );

  const desativar = (id: string) =>
    chamar(`/api/v1/configuracao/equipe/${id}`, { method: "DELETE" }, "Não foi possível remover o acesso.");

  const reativar = (id: string) =>
    chamar(
      `/api/v1/configuracao/equipe/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: true }) },
      "Não foi possível reativar o acesso.",
    );

  /* ---- editar ---- */
  const [editando, setEditando] = useState<PessoaEquipe | null>(null);
  const [edNome, setEdNome] = useState("");
  const [edEmail, setEdEmail] = useState("");
  const [edPapel, setEdPapel] = useState<Papel>("analista");
  const [edSenha, setEdSenha] = useState("");
  const [edErro, setEdErro] = useState<string | null>(null);
  const [edOcupado, setEdOcupado] = useState(false);
  const [excluindo, setExcluindo] = useState<PessoaEquipe | null>(null);

  function abrirEdicao(pessoa: PessoaEquipe) {
    setEditando(pessoa);
    setEdNome(pessoa.nome);
    setEdEmail(pessoa.email ?? "");
    setEdPapel(pessoa.papel);
    setEdSenha("");
    setEdErro(null);
  }

  async function salvarEdicao() {
    if (!editando) return;
    setEdErro(null);

    if (edSenha) {
      const problema = problemaDaSenha(edSenha);
      if (problema) {
        setEdErro(problema);
        return;
      }
    }
    setEdOcupado(true);

    try {
      // Só o que mudou vai no corpo: um PATCH com o e-mail igual ao atual
      // faria o Auth reprocessar a confirmação sem necessidade.
      const mudancas: Record<string, string> = {};
      if (edNome.trim() !== editando.nome) mudancas.nome = edNome;
      if (edEmail.trim().toLowerCase() !== (editando.email ?? "")) mudancas.email = edEmail;
      if (edPapel !== editando.papel) mudancas.papel = edPapel;
      if (edSenha) mudancas.senha = edSenha;

      if (!Object.keys(mudancas).length) {
        setEditando(null);
        return;
      }

      const resposta = await fetch(`/api/v1/configuracao/equipe/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mudancas),
      });
      const corpo = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setEdErro(corpo?.error?.message ?? "Não foi possível salvar.");
        return;
      }

      // Senha nova aparece uma vez, como na criação, para o admin entregar.
      if (mudancas.senha) setCriado({ email: edEmail.trim().toLowerCase(), senha: edSenha });
      setAviso(`${edNome.trim()} atualizado.`);
      setEditando(null);
      router.refresh();
    } catch {
      setEdErro("Não foi possível falar com o servidor.");
    } finally {
      setEdOcupado(false);
    }
  }

  async function excluirDeVez() {
    if (!excluindo) return;
    const pessoa = excluindo;
    setExcluindo(null);
    const deu = await chamar(
      `/api/v1/configuracao/equipe/${pessoa.id}?definitivo=1`,
      { method: "DELETE" },
      "Não foi possível excluir o acesso.",
    );
    if (deu) setAviso(`${pessoa.nome} excluído.`);
  }

  const opcoesDePapel = PAPEIS.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] }));

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left">
              <th scope="col" className="rotulo px-3 py-2.5">Pessoa</th>
              <th scope="col" className="rotulo px-3 py-2.5">Perfil</th>
              <th scope="col" className="rotulo px-3 py-2.5">Acesso</th>
              <th scope="col" className="rotulo px-3 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {equipe.map((pessoa) => (
              <tr key={pessoa.id} className="border-b border-line-strong/30">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <Avatar iniciais={pessoa.iniciais} nome={pessoa.nome} />
                    <span className="flex min-w-0 flex-col">
                      <span className={pessoa.ativa ? undefined : "text-muted line-through"}>{pessoa.nome}</span>
                      {pessoa.email ? (
                        <span className="truncate text-[12px] text-muted">{pessoa.email}</span>
                      ) : null}
                      {pessoa.bloqueadaEm ? (
                        // Três senhas erradas. Só a senha nova libera, e o
                        // caminho é o Editar desta mesma linha.
                        <span
                          title={`Bloqueada em ${new Date(pessoa.bloqueadaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                          className="mt-0.5 w-fit rounded-[4px] bg-bad-soft px-1.5 py-0.5 text-[11.5px] font-[600] text-bad"
                        >
                          Bloqueada por senha errada · redefina a senha em Editar
                        </span>
                      ) : null}
                    </span>
                    {pessoa.id === euMesmo ? <span className="text-[11.5px] text-faint">(você)</span> : null}
                  </span>
                </td>

                <td className="px-3 py-2.5">
                  <select
                    value={pessoa.papel}
                    disabled={!pessoa.ativa}
                    onChange={(e) => void trocarPapel(pessoa.id, e.target.value as Papel)}
                    aria-label={`Perfil de ${pessoa.nome}`}
                    className="h-8 rounded-[6px] border border-line-strong bg-surface px-2 text-[13px] text-texto disabled:opacity-50"
                  >
                    {opcoesDePapel.map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="px-3 py-2.5">
                  {pessoa.ativa ? <span className="text-ok">Ativo</span> : <span className="text-muted">Sem acesso</span>}
                </td>

                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1 text-[12.5px]">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(pessoa)}
                      className="text-heading underline underline-offset-2 hover:text-brand"
                    >
                      Editar
                    </button>
                    {pessoa.id !== euMesmo ? (
                      pessoa.ativa ? (
                        <button
                          type="button"
                          onClick={() => void desativar(pessoa.id)}
                          title="Tira o acesso; o histórico da pessoa fica"
                          className="text-muted underline underline-offset-2 hover:text-heading"
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void reativar(pessoa.id)}
                          className="text-ok underline underline-offset-2 hover:text-heading"
                        >
                          Reativar
                        </button>
                      )
                    ) : null}
                    {pessoa.id !== euMesmo ? (
                      <button
                        type="button"
                        onClick={() => setExcluindo(pessoa)}
                        title="Só para quem nunca assinou nada no sistema"
                        className="text-bad underline underline-offset-2 hover:text-heading"
                      >
                        Excluir
                      </button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={criarAcesso} className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <div className="min-w-[180px] flex-1">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </div>
        <div className="min-w-[220px] flex-1">
          <Campo
            rotulo="E-mail"
            type="email"
            inputMode="email"
            mascara={mascararEmail}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErroEmail(null);
            }}
            onBlur={() => setErroEmail(email.trim() && !emailValido(email) ? "E-mail inválido." : null)}
            erro={erroEmail}
            placeholder="nome@mxseguros.com.br"
          />
        </div>
        <div className="min-w-[160px]">
          <Selecao
            rotulo="Perfil"
            vazio={null}
            opcoes={opcoesDePapel}
            value={papel}
            onChange={(e) => setPapel(e.target.value as Papel)}
            dica={AJUDA_DO_PAPEL[papel]}
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <Campo
            rotulo="Senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setErroSenha(null);
            }}
            onBlur={() => setErroSenha(senha ? problemaDaSenha(senha) : null)}
            erro={erroSenha}
            placeholder="10 ou mais, com letra e número"
          />
        </div>
        <Botao type="button" variante="secundario" onClick={gerar}>
          Gerar senha
        </Botao>
        <Botao
          type="button"
          variante="secundario"
          onClick={() => setMostrarSenha((v) => !v)}
          aria-pressed={mostrarSenha}
        >
          {mostrarSenha ? "Ocultar" : "Mostrar"}
        </Botao>
        <Botao type="submit" disabled={ocupado || !email.trim() || !nome.trim() || !senha}>
          {ocupado ? "Criando…" : "Criar acesso"}
        </Botao>
      </form>

      <p className="text-[12.5px] leading-relaxed text-muted">
        O acesso nasce pronto: a pessoa entra com o e-mail e esta senha. Nada é enviado por e-mail — o
        administrador entrega a senha em mão, e a pessoa pode trocá-la depois em “Esqueci a senha”.
      </p>

      {aviso ? (
        <p role="status" className="text-[13px] text-ok">
          {aviso}
        </p>
      ) : null}

      {criado ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-surface-2 px-3 py-2.5 text-[13px]">
          <span>
            <b className="font-[700] text-heading">{criado.email}</b> · senha{" "}
            <code className="tabular rounded-[4px] bg-surface px-1.5 py-0.5 font-[700] text-heading">
              {criado.senha}
            </code>
          </span>
          <Botao type="button" variante="secundario" onClick={copiar}>
            {copiado ? "Copiado" : "Copiar e-mail e senha"}
          </Botao>
          <button
            type="button"
            onClick={() => setCriado(null)}
            className="text-[12.5px] text-muted underline underline-offset-2 hover:text-heading"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="text-[13px] text-bad">
          {erro}
        </p>
      ) : null}

      <Modal
        aberto={editando !== null}
        titulo={editando ? `Editar ${editando.nome}` : ""}
        descricao="Nome, e-mail e perfil. Nova senha só se preencher — e ela aparece uma vez, para entregar em mão."
        onFechar={() => setEditando(null)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setEditando(null)} disabled={edOcupado}>
              Cancelar
            </Botao>
            <Botao onClick={salvarEdicao} disabled={edOcupado || !edNome.trim() || !edEmail.trim()}>
              {edOcupado ? "Salvando…" : "Salvar"}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Campo rotulo="Nome" value={edNome} onChange={(e) => setEdNome(e.target.value)} />
          <Campo
            rotulo="E-mail"
            type="email"
            inputMode="email"
            mascara={mascararEmail}
            value={edEmail}
            onChange={(e) => setEdEmail(e.target.value)}
          />
          <Selecao
            rotulo="Perfil"
            vazio={null}
            opcoes={opcoesDePapel}
            value={edPapel}
            onChange={(e) => setEdPapel(e.target.value as Papel)}
            // Rebaixar a si mesmo é o jeito mais fácil de se trancar para fora.
            disabled={editando?.id === euMesmo}
            dica={editando?.id === euMesmo ? "Você não pode mudar o próprio perfil." : AJUDA_DO_PAPEL[edPapel]}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Campo
                rotulo="Nova senha (opcional)"
                type="text"
                autoComplete="new-password"
                value={edSenha}
                onChange={(e) => setEdSenha(e.target.value)}
                placeholder="Deixe em branco para manter"
              />
            </div>
            <Botao type="button" variante="secundario" onClick={() => setEdSenha(senhaAleatoria())}>
              Gerar
            </Botao>
          </div>
          {edErro ? (
            <p role="alert" className="text-[12.5px] text-bad">
              {edErro}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        aberto={excluindo !== null}
        titulo={excluindo ? `Excluir ${excluindo.nome}` : ""}
        descricao="Sai do sistema de vez. Só funciona para quem nunca assinou nada — quem tem histórico deve ser desativado, porque a linha do tempo precisa do nome."
        onFechar={() => setExcluindo(null)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setExcluindo(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={excluirDeVez}>
              Excluir de vez
            </Botao>
          </>
        }
      >
        <p className="text-[13px] text-muted">{excluindo?.email ?? ""}</p>
      </Modal>
    </div>
  );
}
