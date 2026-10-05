import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

/**
 * O formulário de coleta tem tipografia própria.
 *
 * Plus Jakarta Sans no texto e JetBrains Mono só onde conferir dígito a dígito
 * importa — CPF e protocolo. O resto do sistema continua em Manrope e Source
 * Sans 3: quem abre este link não é da equipe e nunca vai ver o Controle, então
 * a página não precisa parecer com ele. Precisa parecer com a MX e ser fácil de
 * ler no celular, que é onde o gestor vai abrir.
 *
 * As fontes vêm por `next/font`, hospedadas junto do app: sem ida ao Google
 * no runtime, e a CSP não precisa de origem nova. Os tokens de cor do handoff
 * (`--cp-*`) moram em `globals.css`, sob `.coleta-publica`, e são fixos: a
 * página não segue o tema escuro do sistema, porque nenhuma cor do handoff
 * foi desenhada para ele.
 */

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--fonte-coleta",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--fonte-mono",
});

export default function LayoutDaColeta({ children }: { children: React.ReactNode }) {
  return (
    <div className={`coleta-publica ${jakarta.variable} ${mono.variable} min-h-dvh`}>
      {children}
    </div>
  );
}
