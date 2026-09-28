/**
 * Avatar do responsavel (§4.4).
 *
 * Lead sem dono mostra "?" — nao um espaco vazio. O board tem que gritar
 * "ninguem esta cuidando disto".
 */
export function Avatar({
  iniciais,
  nome,
  semDono = false,
}: {
  iniciais: string;
  nome?: string;
  semDono?: boolean;
}) {
  return (
    <span
      title={semDono ? "Sem responsável" : nome}
      aria-label={semDono ? "Sem responsável" : nome}
      className={
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full " +
        "font-(family-name:--font-display) text-[11px] font-[700] " +
        (semDono
          ? "bg-surface-3 text-faint"
          : "bg-accent-soft text-on-accent-soft")
      }
    >
      {semDono ? "?" : iniciais}
    </span>
  );
}
