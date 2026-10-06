import { redirect } from "next/navigation";

/** Funcionários virou aba da ficha (item 3). O endereço antigo continua abrindo. */
export default async function PaginaFuncionarios({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clientes/${id}?aba=funcionarios`);
}
