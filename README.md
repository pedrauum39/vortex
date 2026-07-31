# Vortex — site do time

Next.js + Supabase. Substitui as planilhas: escala, clock in/out, report de turno com OCR do statement e invoice em tempo real.

Plano e decisões: [workspace-vortex.md](workspace-vortex.md). Regra da escala 3x1: [project.md](project.md).

## Rodar local

```bash
npm install
npm run dev
```

Antes do primeiro `npm run dev`, criar o `.env.local`:

```bash
cp .env.example .env.local
```

## Supabase

Ainda não existe projeto criado. Quando criar em [supabase.com](https://supabase.com):

1. Copiar URL, `anon key` e `service_role key` de **Project Settings → API** para o `.env.local`
2. No **SQL Editor**, rodar os arquivos de `supabase/migrations/` **em ordem**:

   | Arquivo | O que faz |
   |---|---|
   | `0001_schema.sql` | Tabelas, enums, índices, seed de models e regra de comissão placeholder |
   | `0002_rls.sql` | Row Level Security + a view `escala_time` |
   | `0003_storage.sql` | Bucket privado `statements` e suas políticas |

3. Criar o primeiro admin: cadastrar o usuário em **Authentication → Users** e inserir a linha correspondente em `reps` com `role = 'admin'`

## Scripts

| Comando | |
|---|---|
| `npm run dev` | servidor local |
| `npm test` | testes (gerador de escala) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
