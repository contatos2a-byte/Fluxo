// Função do Supabase que lê o print com o Claude (a chave da API fica guardada no servidor,
// nunca no celular). Publicar: supabase functions deploy ler-print
// Guardar a chave:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Só a família pode usar
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ok } = await sb.rpc("eh_familia");
    if (!ok) return new Response(JSON.stringify({ error: "sem acesso" }), { status: 403, headers: { ...cors, "content-type": "application/json" } });

    const { prompt, image, mediaType } = await req.json();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 3000, // um print pode ter vários lançamentos (extrato, gastos do dia)
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
          { type: "text", text: prompt }
        ] }]
      })
    });
    const j = await r.json();
    const text = (j.content || []).map((c: { text?: string }) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    return new Response(m ? m[0] : "null", { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});
