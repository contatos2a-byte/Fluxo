// Notificações do Fluxo no celular (Web Push).
// tipo "teste": manda um aviso de boas-vindas para quem acabou de ativar (precisa estar logado).
// tipo "lembrete" / "contas": chamados pelo relógio do banco (pg_cron), com a senha interna "cron".
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const APP = "https://contatos2a-byte.github.io/Fluxo/";
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const nome = (p: string) => (p === "Sergio Macceddo" ? "Sergio" : p || "");
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const hojeSP = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

const LEMBRETES = [
  { t: "Oiê, {n}! 👋", b: "Ainda não vi seus gastos nem o que entrou hoje. Manda o print agora no Fluxo!" },
  { t: "Psiu, {n}… 🤫", b: "Seu dinheiro fez alguma coisa hoje? Conta pro Fluxo com um print rapidinho." },
  { t: "O ranking tá de olho 👀🏁", b: "{n}, manda os prints de hoje pra não ficar pra trás na disputa!" },
  { t: "Cadê os prints, {n}? 🕵️", b: "Gastou? Recebeu? Um print e pronto. Leva 5 segundos!" },
  { t: "O Fluxo tá com saudade 🥺", b: "Nenhum print seu hoje ainda. Bora registrar antes de dormir?" },
  { t: "Missão do dia 🎯", b: "Mandar os prints de hoje no Fluxo. Aceita a missão, {n}?" },
  { t: "Plim! 💸", b: "Dinheiro que não é anotado some sem avisar. Manda o print de hoje, {n}!" },
  { t: "Alô, {n}! 📲", b: "Seu lucro e seus gastos de hoje estão esperando um print. Envia agora!" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: seg } = await admin.from("segredos").select("nome,valor");
    const S = Object.fromEntries((seg || []).map((r: { nome: string; valor: string }) => [r.nome, r.valor]));
    webpush.setVapidDetails(APP, S.vapid_public, S.vapid_private);
    const body = await req.json().catch(() => ({}));
    const tipo = body.tipo || "lembrete";

    // quem recebe
    const { data: fam } = await admin.from("familia").select("email,pessoa");
    const { data: subs } = await admin.from("push_subs").select("endpoint,email,sub");
    let enviados = 0, removidos = 0;
    async function enviar(email: string | null, msg: { title: string; body: string; tag?: string }) {
      for (const s of (subs || []).filter((x: { email: string }) => !email || x.email.toLowerCase() === email.toLowerCase())) {
        try {
          await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, url: APP }), { TTL: 6 * 3600, urgency: "normal" });
          enviados++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) { await admin.from("push_subs").delete().eq("endpoint", s.endpoint); removidos++; }
          else console.error("push falhou", code, String(e));
        }
      }
    }

    if (tipo === "teste") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(token);
      const email = u?.user?.email?.toLowerCase();
      const membro = (fam || []).find((f: { email: string }) => f.email.toLowerCase() === email);
      if (!email || !membro) return out({ erro: "sem acesso" }, 403);
      await enviar(email, { title: `Notificações ligadas, ${nome(membro.pessoa) || "família"}! 🎉`, body: "Agora o Fluxo te lembra de mandar os prints. Prometo ser legal 😄", tag: "teste" });
      return out({ ok: true, enviados });
    }

    if (req.headers.get("x-cron-secret") !== S.cron) return out({ erro: "sem acesso" }, 403);
    const hoje = hojeSP();

    if (tipo === "lembrete") {
      const inicio = hoje + "T03:00:00Z"; // meia-noite em São Paulo
      for (const f of (fam || []).filter((x: { pessoa: string | null }) => x.pessoa)) {
        const { count } = await admin.from("docs").select("id", { count: "exact", head: true })
          .in("colecao", ["transacoes", "saldos"]).eq("data->>pessoa", f.pessoa)
          .or(`data->>data.eq.${hoje},updated_at.gte.${inicio}`);
        if ((count || 0) > 0) continue;
        const m = pick(LEMBRETES), n = nome(f.pessoa);
        await enviar(f.email, { title: m.t.replace("{n}", n), body: m.b.replace("{n}", n), tag: "lembrete" });
      }
      return out({ ok: true, tipo, enviados, removidos });
    }

    if (tipo === "contas") {
      const { data: rows } = await admin.from("docs").select("id,data").eq("colecao", "contasFixas");
      const [y, mo, d] = hoje.split("-").map(Number);
      const mk = hoje.slice(0, 7), last = new Date(y, mo, 0).getDate();
      const due = (dia: number) => Math.min(Math.max(1, dia | 0), last);
      const lista = (rows || []).map((r: { data: Record<string, unknown> }) => r.data as { nome: string; valor: number; dia: number; pessoa: string; ativa?: boolean; pagas?: Record<string, string> })
        .filter(b => b.ativa !== false && !(b.pagas && b.pagas[mk]));
      const hojeV = lista.filter(b => due(b.dia) === d), amanha = lista.filter(b => due(b.dia) === d + 1);
      const atras = lista.filter(b => due(b.dia) < d);
      if (hojeV.length === 1) await enviar(null, { title: `📅 ${hojeV[0].nome} vence hoje!`, body: `${brl(hojeV[0].valor)} · ${nome(hojeV[0].pessoa)}. Já pagou? Marca no Fluxo ✅`, tag: "contas" });
      else if (hojeV.length > 1) await enviar(null, { title: `📅 ${hojeV.length} contas vencem hoje!`, body: hojeV.map(b => `${b.nome} ${brl(b.valor)}`).join(" · ") + ". Bora pagar? ✅", tag: "contas" });
      if (amanha.length) await enviar(null, { title: amanha.length === 1 ? `⏰ Amanhã vence ${amanha[0].nome}` : `⏰ ${amanha.length} contas vencem amanhã`, body: amanha.map(b => `${b.nome} ${brl(b.valor)}`).join(" · ") + ". Já deixa separado! 😉", tag: "contas-amanha" });
      if (atras.length && d % 3 === 0) await enviar(null, { title: `🚨 ${atras.length === 1 ? "Tem conta atrasada" : atras.length + " contas atrasadas"}`, body: atras.map(b => `${b.nome} ${brl(b.valor)}`).join(" · ") + ". Se já pagou, marca no Fluxo!", tag: "contas-atrasadas" });
      return out({ ok: true, tipo, enviados, removidos });
    }
    return out({ erro: "tipo desconhecido" }, 400);
  } catch (e) {
    console.error(String(e));
    return out({ erro: "falhou" }, 500);
  }
});
