/* Fluxo · camada que liga o painel ao Supabase.
   O painel foi feito para rodar dentro do Claude (window.claude.use("db"), "user", "sample", "mcp").
   Aqui recriamos essas mesmas peças em cima do Supabase, para o app funcionar sozinho no celular. */
(function () {
  const cfg = window.FLUXO_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !/SEU-PROJETO/.test(cfg.supabaseUrl) && window.supabase);
  const sb = ready ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
  window.fluxoSupabase = sb;

  /* ---------- login com e-mail e senha ---------- */
  // (senha em vez de link: no iPhone o app da tela inicial não enxerga o login feito no Safari)
  function loginScreen(msg) {
    let el = document.getElementById("fluxoLogin");
    if (!el) {
      el = document.createElement("div"); el.id = "fluxoLogin";
      el.innerHTML = `<div class="lg-card"><img src="icons/icon-192.png" alt="" width="72" height="72"><h2>Fluxo</h2><p id="lgMsg"></p>
        <form id="lgForm"><input id="lgEmail" type="email" placeholder="seu e-mail" autocomplete="email" autocapitalize="off" required>
        <input id="lgPass" type="password" placeholder="senha" autocomplete="current-password" minlength="6" required>
        <button class="btn" type="submit" id="lgBtn">Entrar</button></form>
        <button type="button" id="lgTroca" class="lg-link">Primeiro acesso? Criar minha senha</button></div>`;
      const st = document.createElement("style");
      st.textContent = `#fluxoLogin{position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:radial-gradient(600px 400px at 70% 10%,rgba(198,244,50,.18),transparent 70%),#060706;padding:24px}
      #fluxoLogin[hidden]{display:none}
      #fluxoLogin .lg-card{width:min(360px,100%);display:grid;gap:14px;text-align:center;justify-items:center;color:#eef5f0;font-family:"Plus Jakarta Sans",system-ui,sans-serif}
      #fluxoLogin img{border-radius:18px;box-shadow:0 0 40px rgba(198,244,50,.3)} #fluxoLogin h2{font-family:Sora,system-ui;margin:0;font-size:28px}
      #fluxoLogin p{margin:0;color:#8fa39a;font-size:14px;min-height:1.4em} #fluxoLogin form{display:grid;gap:10px;width:100%}
      #fluxoLogin input{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:12px;padding:12px 14px;font-size:16px;color:#eef5f0}
      #fluxoLogin .lg-link{background:none;border:0;color:#c6f432;font-size:14px;cursor:pointer;padding:6px}`;
      document.head.appendChild(st); document.body.appendChild(el);
      let criar = false;
      const $ = s => el.querySelector(s), say = t => { $("#lgMsg").textContent = t; };
      $("#lgTroca").addEventListener("click", () => {
        criar = !criar;
        $("#lgBtn").textContent = criar ? "Criar senha e entrar" : "Entrar";
        $("#lgTroca").textContent = criar ? "Já tenho senha" : "Primeiro acesso? Criar minha senha";
        $("#lgPass").autocomplete = criar ? "new-password" : "current-password";
        say(criar ? "Escolha uma senha (mínimo 6 caracteres). Vale só para e-mails da família." : "Entre com o e-mail da família e sua senha.");
      });
      $("#lgForm").addEventListener("submit", async e => {
        e.preventDefault();
        const email = $("#lgEmail").value.trim().toLowerCase(), password = $("#lgPass").value;
        $("#lgBtn").disabled = true; say(criar ? "Criando seu acesso…" : "Entrando…");
        try {
          if (criar) {
            const { data, error } = await sb.functions.invoke("criar-acesso", { body: { email, password } });
            let code = data && data.erro;
            if (error) { try { code = (await error.context.json()).erro; } catch (_) { code = "falhou"; } }
            if (code) {
              say({ ja_existe: "Esse e-mail já tem senha. Toque em \"Já tenho senha\" e entre.", fora_da_familia: "Esse e-mail não está na lista da família.", senha_curta: "A senha precisa ter pelo menos 6 caracteres." }[code] || "Não consegui criar agora. Tente de novo.");
              return;
            }
          }
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) say("E-mail ou senha não conferem.");
        } finally { $("#lgBtn").disabled = false; }
      });
    }
    el.querySelector("#lgMsg").textContent = msg || "Entre com o e-mail da família e sua senha.";
    el.hidden = false;
  }
  let sessionP = null;
  function session() {
    if (!sb) return Promise.resolve(null);
    if (sessionP) return sessionP;
    sessionP = new Promise(async resolve => {
      const { data } = await sb.auth.getSession();
      if (data.session) return resolve(data.session);
      loginScreen();
      sb.auth.onAuthStateChange((_ev, s) => { if (s) { const el = document.getElementById("fluxoLogin"); if (el) el.hidden = true; resolve(s); } });
    });
    return sessionP;
  }

  /* ---------- banco de dados no formato do painel ---------- */
  const listeners = new Map(); // colecao -> Set(fn)
  let channel = null;
  function ensureChannel() {
    if (channel) return;
    channel = sb.channel("docs").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const c = (p.new && p.new.colecao) || (p.old && p.old.colecao);
      if (c) refresh(c); else for (const k of listeners.keys()) refresh(k);
    }).subscribe();
  }
  async function fetchCol(c) {
    const { data, error } = await sb.from("docs").select("id,data").eq("colecao", c);
    if (error) throw error; return data || [];
  }
  async function refresh(c) {
    const fns = listeners.get(c); if (!fns || !fns.size) return;
    try { const rows = await fetchCol(c); fns.forEach(f => f.ok(rows)); } catch (e) { fns.forEach(f => f.err && f.err(e)); }
  }
  function docRef(c, id) {
    return {
      id,
      async set(d) {
        const { error } = await sb.from("docs").upsert({ colecao: c, id, data: d, updated_at: new Date().toISOString() }); if (error) throw error; refresh(c);
        // registro novo (não edição): avisa o resto da família
        if ((c === "transacoes" || c === "saldos") && d && d.criadoEm && !d.atualizadoEm && !d.lote && Date.now() - Date.parse(d.criadoEm) < 120e3)
          sb.functions.invoke("avisos", { body: { tipo: "novo", colecao: c, id } }).catch(() => {});
      },
      async delete() { const { error } = await sb.from("docs").delete().eq("colecao", c).eq("id", id); if (error) throw error; refresh(c); },
      onSnapshot(cb, err) {
        return colRef(c).onSnapshot(snap => { const d = snap.docs.find(x => x.id === id); cb({ exists: !!d, data: () => d ? d.data() : undefined }); }, err);
      }
    };
  }
  function colRef(c) {
    return {
      doc(id) { return docRef(c, id || crypto.randomUUID()); },
      async add(d) { const r = docRef(c, crypto.randomUUID()); await r.set(d); return r; },
      onSnapshot(cb, err) {
        ensureChannel();
        const f = { ok: rows => cb({ docs: rows.map(r => ({ id: r.id, data: () => r.data })), metadata: { fromCache: false } }), err };
        if (!listeners.has(c)) listeners.set(c, new Set());
        listeners.get(c).add(f); refresh(c);
        return () => listeners.get(c).delete(f);
      }
    };
  }
  const db = { collection: colRef, doc(path) { const [c, id] = path.split("/"); return docRef(c, id); } };

  /* ---------- leitura do print (função ler-print no Supabase) ---------- */
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  const sample = {
    async json(prompt, opts) {
      const img = opts && opts.images && opts.images[0]; if (!img) return null;
      const { data, error } = await sb.functions.invoke("ler-print", { body: { prompt, image: await b64(img), mediaType: img.type || "image/jpeg" } });
      if (error) throw error; return data;
    }
  };

  /* ---------- guardar o print (Supabase Storage no lugar do Google Drive) ---------- */
  const mcp = {
    async callTool(_server, _tool, args) {
      const path = `${(args.parentId || "geral")}/${args.title}`;
      const bin = Uint8Array.from(atob(args.base64Content), ch => ch.charCodeAt(0));
      const { error } = await sb.storage.from("prints").upload(path, new Blob([bin], { type: args.contentMimeType || "image/jpeg" }), { upsert: false });
      if (error) throw error;
      return { payload: { id: "sb_" + path.replace(/[^\w.-]/g, "_") } };
    }
  };

  window.claude = {
    async use(name) {
      if (!sb) throw new Error("config");
      await session();
      if (name === "db") return db;
      if (name === "user") return { can: async () => true, email: (await sb.auth.getUser()).data.user?.email };
      if (name === "sample") return sample;
      if (name === "mcp") return mcp;
      // vários prints de uma vez: um aviso só para a família, com o resumo do lote
      if (name === "avisos") return { lote: itens => sb.functions.invoke("avisos", { body: { tipo: "lote", itens } }) };
      throw new Error("indisponível");
    }
  };

  /* ---------- notificações no celular ---------- */
  const b64ToBytes = s => { const p = "=".repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const VAPID = "BNDPiJ28n3XeKBsM5tc6cgl99gsTpcWUQFt1ncvATHzwOnODKJI7NlVfudf1h5mSWHERR7TEzjXY1R8X1DrO3B0";
  let swReg = null;
  if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then(r => { swReg = r; }).catch(() => {});
  window.fluxoPush = {
    // "sem-suporte" | "instalar" (iPhone fora da tela de início) | "bloqueado" | "ativo" | "pode-ativar"
    async estado() {
      const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "instalar" : "sem-suporte";
      if (Notification.permission === "denied") return "bloqueado";
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub && Notification.permission === "granted" ? "ativo" : "pode-ativar";
    },
    async ativar() {
      const key = b64ToBytes(cfg.vapidPublicKey || VAPID);
      const reg = swReg || await navigator.serviceWorker.ready;
      let sub;
      // no iPhone o pedido de permissão precisa sair direto do toque: tentamos assinar primeiro
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); }
      catch (e) {
        if (Notification.permission === "denied") return "bloqueado";
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return perm === "denied" ? "bloqueado" : "pode-ativar";
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      const email = (await sb.auth.getUser()).data.user?.email;
      const j = sub.toJSON();
      const { error } = await sb.from("push_subs").upsert({ endpoint: j.endpoint, email, sub: j });
      if (error) throw Object.assign(new Error(error.message), { name: "Banco" });
      sb.functions.invoke("avisos", { body: { tipo: "teste" } }).catch(() => {});
      return "ativo";
    }
  };
  window.fluxoSair = () => sb && sb.auth.signOut().then(() => location.reload());

  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
