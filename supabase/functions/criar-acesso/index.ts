// Primeiro acesso: cria a senha de quem é da família (tabela "familia"), sem precisar de e-mail.
// Quem não estiver na lista não consegue criar conta.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, password } = await req.json();
    const e = String(email || "").trim().toLowerCase();
    if (!e || String(password || "").length < 6) return out({ erro: "senha_curta" }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: fam } = await admin.from("familia").select("email").ilike("email", e).maybeSingle();
    if (!fam) return out({ erro: "fora_da_familia" }, 403);
    const { error } = await admin.auth.admin.createUser({ email: e, password, email_confirm: true });
    if (error) return out({ erro: /already|registered|exists/i.test(error.message) ? "ja_existe" : "falhou" }, 409);
    return out({ ok: true });
  } catch (_e) {
    return out({ erro: "falhou" }, 500);
  }
});
