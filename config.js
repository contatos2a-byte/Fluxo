// Endereço e chave pública do Supabase. A chave "anon" pode ficar no app: quem protege
// os dados são as regras de acesso (RLS) do arquivo supabase/schema.sql.
window.FLUXO_CONFIG = {
  supabaseUrl: "https://lzdvcrbglognvxrkwjer.supabase.co",
  vapidPublicKey: "BNDPiJ28n3XeKBsM5tc6cgl99gsTpcWUQFt1ncvATHzwOnODKJI7NlVfudf1h5mSWHERR7TEzjXY1R8X1DrO3B0",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6ZHZjcmJnbG9nbnZ4cmt3amVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzOTUxMTgsImV4cCI6MjExMDk3MTExOH0.4BV8jzzN8lUML3kXnU1pwwkMnquWH2HvovQd6CYDlwI"
};
// Quem pode entrar é definido só no banco (tabela "familia"), nunca aqui:
// este arquivo fica público junto com o site.
