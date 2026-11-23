// Copie este arquivo para config.js e preencha com os dados do seu projeto Supabase
// (Supabase → Project Settings → API). A chave "anon" pode ficar no app: quem protege
// os dados são as regras de acesso (RLS) do arquivo supabase/schema.sql.
window.FLUXO_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "SUA-CHAVE-ANON"
};
// Quem pode entrar é definido só no banco (tabela "familia"), nunca aqui:
// este arquivo fica público junto com o site.
