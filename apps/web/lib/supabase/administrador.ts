import "server-only";

import { createClient } from "@supabase/supabase-js";
import { chaveSecreta, urlSupabase } from "../ambiente";

/**
 * Cliente com a chave secreta: IGNORA a RLS.
 *
 * Usar so onde nao existe sessao e a autoridade e da propria API — a captura
 * publica da Fase 1 (POST /leads/public), depois de validacao e anti-spam.
 * Nunca em componente de cliente.
 */
export function clienteAdministrador() {
  return createClient(urlSupabase(), chaveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
