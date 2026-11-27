// Notificações do Fluxo no celular (Web Push).
// tipo "teste": manda um aviso de boas-vindas para quem acabou de ativar (precisa estar logado).
// tipo "novo": entrada, saída ou saldo registrado no app. O resto da família recebe o aviso (quem registrou, não).
// tipo "lembrete" / "contas" / "resumo": chamados pelo relógio do banco (pg_cron), com a senha interna "cron".
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

// Frases dos avisos de registro novo. {q} = quem registrou, {v} = valor, {e} = estabelecimento,
// {b} = banco, {c} = categoria, {de} = " · de Fulana" quando o lançamento é de outra pessoa.
type F = { t: string; b: string };
const ENTRADA_OUTROS: F[] = [
  { t: "🤑 Entrou dinheiro! {q} registrou", b: "{e} · +{v}{de}" },
  { t: "💰 Plim plim! {q} trouxe dinheiro pra casa", b: "+{v} de {e}{de}. Aplausos! 👏" },
  { t: "🎉 Chuva de dinheiro na área!", b: "{q} registrou {e}: +{v}{de}" },
  { t: "🚀 O caixa subiu! Obra de {q}", b: "+{v} · {e}{de}" },
  { t: "🥳 Tem dinheiro novo no Fluxo!", b: "{q} anotou +{v} de {e}{de}" },
  { t: "👑 {q} tá on fire!", b: "Entrada de {v} ({e}){de}. Que fase! 🔥" },
  { t: "🍀 Dia de sorte? {q} registrou uma entrada", b: "{e} · +{v}{de}" },
  { t: "💸➡️🏦 Dinheirinho chegando!", b: "{q} registrou +{v} de {e}{de}" },
  { t: "🕺 Dancinha da vitória!", b: "{q} lançou uma entrada de {v} ({e}){de}" },
  { t: "📈 Gráfico subindo, família!", b: "{q} registrou +{v} · {e}{de}" },
];
const ENTRADA_GRANDE: F[] = [
  { t: "🎊 ENTRADA GORDA! {q} registrou +{v}", b: "{e}{de}. Hoje tem comemoração? 🍾" },
  { t: "🤯 Uau! +{v} de uma vez só!", b: "{q} registrou {e}{de}. Que orgulho! 🏆" },
  { t: "💎 Dinheiro grande na área!", b: "{q} lançou +{v} ({e}){de}. Que fase! 👑" },
];
const SAIDA_OUTROS: F[] = [
  { t: "💸 Saiu dinheiro! {q} registrou", b: "{e} · {v}{de}" },
  { t: "🧾 {q} passou o cartão", b: "{e} · {v}{de}. Tá anotado! ✍️" },
  { t: "👀 Olha o gasto aí!", b: "{q} registrou {e}: {v}{de}" },
  { t: "📉 Lá se foi {v}…", b: "{q} registrou {e}{de}. Pelo menos tá anotado 😅" },
  { t: "🫡 Gasto anotado, valeu {q}!", b: "{e} · {v}{de}. Organização é tudo!" },
  { t: "🐷 O cofrinho sentiu essa", b: "{q} gastou {v} em {e}{de}" },
  { t: "💳 Plim! Cartão em ação", b: "{q} registrou {e} · {v}{de}" },
  { t: "📲 Novo gasto no Fluxo", b: "{q} mandou: {e} · {v}{de}" },
];
const SAIDA_GRANDE: F[] = [
  { t: "😱 Eita, gasto grande!", b: "{q} registrou {e}: {v}{de}" },
  { t: "🫣 Segura a carteira, família!", b: "{q} lançou {v} em {e}{de}" },
  { t: "🚨 Alerta de gastão: {v}", b: "{e}{de}, registrado por {q}. Tá tudo sob controle? 😅" },
];
const SAIDA_CAT: Record<string, F[]> = {
  "Mercado": [
    { t: "🛒 Carrinho cheio! {q} foi ao mercado", b: "{e} · {v}{de}" },
    { t: "🥦 A geladeira agradece!", b: "{q} registrou mercado: {e} · {v}{de}" },
  ],
  "Alimentação": [
    { t: "🍔 Bateu a fome?", b: "{q} registrou {e} · {v}{de}. Bom apetite! 😋" },
    { t: "🍕 Hmm, que delícia!", b: "{q} comeu bem: {e} · {v}{de}" },
  ],
  "Transporte": [
    { t: "🚗 Vrum vrum! {q} registrou transporte", b: "{e} · {v}{de}" },
    { t: "⛽ Rodando por aí…", b: "{q} gastou {v} com {e}{de}" },
  ],
  "Casa": [
    { t: "🏠 Lar doce lar", b: "{q} registrou {e} · {v}{de}" },
  ],
  "Contas": [
    { t: "📄 Conta paga é paz de espírito", b: "{q} registrou {e} · {v}{de} 🧘" },
  ],
  "Saúde": [
    { t: "💊 Saúde em primeiro lugar!", b: "{q} registrou {e} · {v}{de}. Se cuida! 💚" },
  ],
  "Lazer": [
    { t: "🎉 Momento de lazer!", b: "{q} registrou {e} · {v}{de}. Aproveita! 🍿" },
    { t: "🎢 A vida é pra ser vivida", b: "{q} curtiu: {e} · {v}{de}" },
  ],
  "Compras": [
    { t: "🛍️ Comprinhas!", b: "{q} registrou {e} · {v}{de}. Mostra depois! 👀" },
  ],
  "Educação": [
    { t: "📚 Investindo no cérebro!", b: "{q} registrou {e} · {v}{de} 🧠" },
  ],
};
const W5_ENTRADA: F[] = [
  { t: "🏢 A W5 faturou! {q} registrou", b: "+{v} · {e}. Bora crescer! 📈" },
  { t: "💼 Dinheiro na W5!", b: "{q} lançou +{v} ({e}). Empresa voando! 🚀" },
];
const W5_SAIDA: F[] = [
  { t: "🏢 Despesa da W5", b: "{q} registrou {e} · {v}" },
  { t: "💼 Saiu da W5", b: "{e} · {v}, anotado por {q}" },
];
const SALDO_OUTROS: F[] = [
  { t: "🏦 {q} atualizou um saldo", b: "{b}: {v}{de}" },
  { t: "🔎 Raio-X da conta!", b: "{q} mandou o saldo do {b}: {v}{de}" },
  { t: "📊 Saldo fresquinho no Fluxo", b: "{b} · {v}{de}, atualizado por {q}" },
];
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
function frase(colecao: string, d: Record<string, unknown>) {
  const valor = Number(d.valor) || 0, w5 = d.pessoa === "W5";
  let pool: F[];
  if (colecao === "saldos") pool = SALDO_OUTROS;
  else if (d.tipo === "entrada") pool = w5 ? W5_ENTRADA : valor >= 1000 && Math.random() < .7 ? ENTRADA_GRANDE : ENTRADA_OUTROS;
  else if (w5) pool = W5_SAIDA;
  else if (valor >= 500 && Math.random() < .6) pool = SAIDA_GRANDE;
  else { const cat = SAIDA_CAT[String(d.categoria || "")]; pool = cat && Math.random() < .5 ? cat : SAIDA_OUTROS; }
  return pick(pool);
}

// Resumo das 8h: saldo das contas da família, o que entrou e saiu ontem, como está o mês e o destaque de ontem.
// A W5 fica de fora dos totais da família, como no app.
type Reg = { tipo?: string; valor?: number; data?: string; hora?: string; pessoa?: string; banco?: string; conta?: string };
// mesma conta do app: o saldo vale o último print + o que entrou e saiu naquela conta depois dele
const MAIN_DEFAULT: Record<string, string> = { "Sergio Macceddo": "Mercado Pago", "Ana Paula": "Nubank", "Ana Laura": "Inter", "W5": "W5 (Nu Empresas)" };
const normB = (x: unknown) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl0 = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const diaMais = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const RESUMO_T = [
  "☀️ Bom dia, {n}! Seu resumo do Fluxo",
  "☕ Café com Fluxo, {n}!",
  "🌅 Bom dia, {n}! Olha como tá a família",
  "📊 Resumo fresquinho, {n}!",
  "🐓 Cocoricó, {n}! Hora do resumo",
  "🌞 Acorda, {n}! O Fluxo já fez as contas",
  "🧮 Bom dia, {n}! As contas de hoje",
];
function montarResumo(tx: Reg[], sd: Reg[], hoje: string, pessoa: string, principais: Record<string, string> = {}) {
  const fam = (r: Reg) => r && r.pessoa !== "W5";
  const T = tx.filter(fam), Sd = sd.filter(fam), ontem = diaMais(hoje, -1);
  const soma = (a: Reg[], tipo: string) => a.filter(t => t.tipo === tipo).reduce((x, t) => x + (Number(t.valor) || 0), 0);
  const partes: string[] = [];
  // saldo: o mais recente de cada conta de cada pessoa
  const ult = new Map<string, Reg>();
  for (const r of Sd) { const k = r.pessoa + "|" + r.banco, o = ult.get(k); if (!o || (r.data || "") + (r.hora || "") > (o.data || "") + (o.hora || "")) ult.set(k, r); }
  const conta = (t: Reg) => (t.conta && String(t.conta).trim()) || principais[t.pessoa || ""] || MAIN_DEFAULT[t.pessoa || ""] || "";
  const quando = (t: Reg) => (t.data || "") + (t.hora || "00:00"), fim = hoje + "23:59";
  const saldo = [...ult.values()].reduce((x, b) => x + (Number(b.valor) || 0) + T
    .filter(t => t.pessoa === b.pessoa && normB(conta(t)) === normB(b.banco) && quando(t) > (b.data || "") + (b.hora || "") && quando(t) <= fim)
    .reduce((y, t) => y + (t.tipo === "entrada" ? 1 : -1) * (Number(t.valor) || 0), 0), 0);
  if (ult.size) partes.push(`💰 Nas contas da família: ${brl0(saldo)}.`);
  const tOntem = T.filter(t => t.data === ontem), eO = soma(tOntem, "entrada"), sO = soma(tOntem, "saida");
  if (eO && sO) partes.push(`Ontem entrou ${brl0(eO)} e saiu ${brl0(sO)}.`);
  else if (eO) partes.push(`Ontem entrou ${brl0(eO)} e não saiu nada 🙌`);
  else if (sO) partes.push(`Ontem saiu ${brl0(sO)}.`);
  else partes.push(pick(["Ontem ninguém registrou nada 👀", "Ontem o Fluxo ficou quietinho 🤫"]));
  const fechou = hoje.endsWith("-01"), mk = fechou ? ontem.slice(0, 7) : hoje.slice(0, 7);
  const tMes = T.filter(t => (t.data || "").startsWith(mk)), res = soma(tMes, "entrada") - soma(tMes, "saida");
  if (tMes.length) {
    const mes = MESES[Number(mk.slice(5, 7)) - 1];
    partes.push(fechou ? `${mes[0].toUpperCase() + mes.slice(1)} fechou ${res >= 0 ? "com sobra de " + brl0(res) + " 🎉" : "no vermelho em " + brl0(-res) + " 🔴"}`
      : `No mês: ${res >= 0 ? "sobrando " + brl0(res) + " ✅" : brl0(-res) + " no vermelho 🔴"}`);
  }
  // destaque: quem mais registrou ontem
  const cont = new Map<string, number>();
  for (const r of [...T, ...Sd].filter(r => r.data === ontem && r.pessoa)) cont.set(r.pessoa!, (cont.get(r.pessoa!) || 0) + 1);
  const rank = [...cont.entries()].sort((a, b) => b[1] - a[1]);
  if (rank.length && (rank.length === 1 || rank[0][1] > rank[1][1])) partes.push(rank[0][0] === pessoa ? "🏆 Destaque de ontem: você! 👏" : `🏆 Destaque de ontem: ${nome(rank[0][0])}!`);
  partes.push(!tMes.length ? pick(["Bom dia e bons negócios! 😄", "Não esquece de mandar os prints hoje 📲"])
    : res >= 0 ? pick(["Bora manter! 💪", "Tá voando! 🚀", "Assim que se faz! 😎"]) : pick(["Bora segurar os gastos hoje 😬", "Hoje é dia de economizar 🐷"]));
  return { title: pick(RESUMO_T).replace("{n}", nome(pessoa)), body: partes.join(" ") };
}

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
    const simular = body.simular === true, previa: unknown[] = []; // simular: monta os avisos sem mandar (para testes)
    async function enviar(email: string | null, msg: { title: string; body: string; tag?: string }) {
      if (simular) { previa.push({ para: email || "todos", ...msg }); return; }
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

    if (tipo === "teste" || tipo === "novo" || tipo === "lote") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(token);
      const email = u?.user?.email?.toLowerCase();
      const membro = (fam || []).find((f: { email: string }) => f.email.toLowerCase() === email);
      if (!email || !membro) return out({ erro: "sem acesso" }, 403);
      if (tipo === "lote") { // vários prints de uma vez: um aviso só, com o resumo
        const itens = (Array.isArray(body.itens) ? body.itens : []).slice(0, 200) as { colecao?: string; id?: string }[];
        const rows: Record<string, unknown>[] = [];
        for (const c of ["transacoes", "saldos"]) {
          const ids = itens.filter(i => (i.colecao === "saldos" ? "saldos" : "transacoes") === c).map(i => String(i.id || ""));
          if (!ids.length) continue;
          const { data } = await admin.from("docs").select("data").eq("colecao", c).in("id", ids);
          for (const r of data || []) rows.push({ ...(r.data as Record<string, unknown>), _c: c });
        }
        const novos = rows.filter(d => d.criadoEm && !d.atualizadoEm && Date.now() - Date.parse(String(d.criadoEm)) < 10 * 60e3);
        if (!novos.length) return out({ ok: true, ignorado: true });
        const quem = nome(membro.pessoa) || "Alguém da família";
        const tr = novos.filter(d => d._c === "transacoes");
        const sai = tr.filter(d => d.tipo !== "entrada"), ent = tr.filter(d => d.tipo === "entrada"), sal = novos.filter(d => d._c === "saldos");
        const tot = (a: Record<string, unknown>[]) => brl(a.reduce((x, d) => x + (Number(d.valor) || 0), 0));
        const donos = [...new Set(novos.map(d => String(d.pessoa || "")).filter(p => p && p !== membro.pessoa))];
        const de = donos.length === 1 ? ` · ${donos[0] === "W5" ? "da W5" : "de " + nome(donos[0])}` : "";
        const partes = [sai.length && `${sai.length} saída${sai.length > 1 ? "s" : ""} (${tot(sai)})`, ent.length && `${ent.length} entrada${ent.length > 1 ? "s" : ""} (+${tot(ent)})`, sal.length && `${sal.length} saldo${sal.length > 1 ? "s" : ""} de conta`].filter(Boolean);
        const msg = { title: pick([`📸 ${quem} mandou ${novos.length} lançamentos de uma vez!`, `🧾 Lote de prints! ${quem} registrou ${novos.length}`, `⚡ ${quem} colocou o Fluxo em dia: ${novos.length} registros`]), body: partes.join(" · ") + de, tag: "lote-" + Date.now() };
        for (const s of (subs || []).filter((x: { email: string }) => x.email.toLowerCase() !== email)) {
          if (simular) { previa.push({ para: s.email, ...msg }); continue; }
          try { await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, url: APP }), { TTL: 6 * 3600, urgency: "normal" }); enviados++; }
          catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) { await admin.from("push_subs").delete().eq("endpoint", s.endpoint); removidos++; }
            else console.error("push falhou", code, String(e));
          }
        }
        return out({ ok: true, enviados, removidos, ...(simular ? { previa } : {}) });
      }
      if (tipo === "novo") {
        const colecao = body.colecao === "saldos" ? "saldos" : "transacoes";
        const { data: row } = await admin.from("docs").select("data").eq("colecao", colecao).eq("id", String(body.id || "")).maybeSingle();
        const d = row?.data as Record<string, unknown> | undefined;
        if (!d || d.atualizadoEm || !d.criadoEm || Date.now() - Date.parse(String(d.criadoEm)) > 5 * 60e3) return out({ ok: true, ignorado: true });
        const quem = nome(membro.pessoa) || "Alguém da família";
        const dono = String(d.pessoa || "");
        const de = dono && dono !== membro.pessoa ? ` · ${dono === "W5" ? "da W5" : "de " + nome(dono)}` : "";
        const vars = {
          q: quem, v: brl(Number(d.valor) || 0), de, c: String(d.categoria || ""),
          e: String(d.estabelecimento || (d.tipo === "entrada" ? "Entrada" : "Gasto")),
          b: String(d.banco || d.estabelecimento || "Conta").replace(/^banco\s+/i, ""),
        };
        const f = frase(colecao, d);
        const msg = { title: fill(f.t, vars), body: fill(f.b, vars), tag: "novo-" + String(body.id || "").slice(-12) };
        for (const s of (subs || []).filter((x: { email: string }) => x.email.toLowerCase() !== email)) { // quem registrou não recebe
          try { await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, url: APP }), { TTL: 6 * 3600, urgency: "normal" }); enviados++; }
          catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) { await admin.from("push_subs").delete().eq("endpoint", s.endpoint); removidos++; }
            else console.error("push falhou", code, String(e));
          }
        }
        return out({ ok: true, enviados, removidos });
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
      return out({ ok: true, tipo, enviados, removidos, ...(simular ? { previa } : {}) });
    }

    if (tipo === "resumo") {
      const [{ data: tx }, { data: sd }, { data: cfg }] = await Promise.all([
        admin.from("docs").select("data").eq("colecao", "transacoes"),
        admin.from("docs").select("data").eq("colecao", "saldos"),
        admin.from("docs").select("data").eq("colecao", "config").eq("id", "sistema").maybeSingle(),
      ]);
      const principais = ((cfg?.data as { contasPrincipais?: Record<string, string> } | undefined)?.contasPrincipais) || {};
      const regs = (rows: { data: Reg }[] | null) => (rows || []).map(r => r.data).filter(Boolean);
      const so = body.email ? String(body.email).toLowerCase() : null; // para testar com uma pessoa só
      for (const f of (fam || []).filter((x: { email: string; pessoa: string | null }) => x.pessoa && (!so || x.email.toLowerCase() === so))) {
        await enviar(f.email, { ...montarResumo(regs(tx), regs(sd), hoje, f.pessoa, principais), tag: "resumo" });
      }
      return out({ ok: true, tipo, enviados, removidos, ...(simular ? { previa } : {}) });
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
      return out({ ok: true, tipo, enviados, removidos, ...(simular ? { previa } : {}) });
    }
    return out({ erro: "tipo desconhecido" }, 400);
  } catch (e) {
    console.error(String(e));
    return out({ erro: "falhou" }, 500);
  }
});
