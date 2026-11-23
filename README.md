# Fluxo · Finanças da Casa

App da família para controlar dinheiro: prints de comprovantes, saldo das contas, ranking do mês,
contas fixas, orçamento e metas. Funciona como aplicativo no iPhone (ícone na tela inicial, tela cheia).

## Como instalar no iPhone
1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar** (quadrado com a seta) → **Adicionar à Tela de Início**.
3. Pronto: o ícone verde do Fluxo fica na tela inicial.

## Como é montado
| Parte | Onde fica |
|---|---|
| Telas do app | `index.html` (mesmo painel que já usávamos no Claude) |
| Ícone, nome, tela cheia | `manifest.webmanifest`, `icons/`, `sw.js` |
| Dados e login | Supabase (tabela `docs`, login com e-mail e senha) via `fluxo-runtime.js` |
| Fotos dos prints | Supabase Storage, pasta `prints` |
| Leitura automática do print | Função `supabase/functions/ler-print` (usa o Claude) |
| Endereço do app | GitHub Pages |

## Arquivos
- `config.js` — endereço e chave pública do Supabase (pode ser público; quem entra é definido no banco).
- `supabase/schema.sql` — cria a tabela, as regras de acesso (só a família) e a pasta de prints.

> Dados financeiros e e-mails da família **nunca** vão para este repositório: ficam só no Supabase, protegidos por login.
