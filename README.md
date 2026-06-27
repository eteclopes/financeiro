# Sistema de Gestão Financeira Pessoal Inteligente

## Status do projeto

Concluído nesta entrega:
- Etapa 1 — Arquitetura Funcional (`arquitetura-etapas-1-2.md`)
- Etapa 2 — Modelagem do Banco (`arquitetura-etapas-1-2.md`)
- Etapa 3 — `database.sql`
- Etapa 4 — `backend/prisma/schema.prisma`
- Etapa 5 — Arquitetura backend (estrutura de pastas, camadas, middlewares)
- Etapa 6 — Autenticação completa (cadastro, login, logout, refresh, recuperação de senha)
- Etapa 7 — Receitas (criar, editar, excluir, listar, recorrência)
- Etapa 8 — Despesas fixas e variáveis
- Etapa 9 — Parcelamentos (despesas de prioridade)
- Etapa 10 — Pagamento flexível e excedente
- Etapa 11 — Cartões de crédito, compras parceladas e faturas
- Etapa 12 — Saldo Guardado
- Etapa 13 — Metas
- Etapa 14 — Dashboard
- Etapa 15 — Fechamento Mensal
- Frontend (parcial) — Login, Cadastro, Recuperação de Senha e Dashboard em React, conectados à API real

Pendente para as próximas entregas: saúde financeira, alertas, simuladores, projeções, relatórios; telas de Receitas, Despesas, Dívidas, Cartões, Saldo Guardado e Metas no frontend; testes e auditoria final (Etapas 16 a 20).

## Setup local (XAMPP)

1. Suba o MySQL/MariaDB pelo painel do XAMPP.
2. No phpMyAdmin (ou via linha de comando), importe `database.sql` — ele já cria o banco `financeiro_pessoal` e todas as tabelas.
3. Dentro de `backend/`:
   ```bash
   cp .env.example .env
   # edite .env com usuário/senha do seu MySQL local
   npm install
   npm run prisma:generate
   node prisma/seed.js   # popula categorias padrão
   npm run dev
   ```
4. API disponível em `http://localhost:3333/api` (teste com `GET /api/health`).

## Alternativa via Prisma Migrate (em vez de importar database.sql manualmente)

Se preferir deixar o Prisma criar as tabelas a partir do `schema.prisma` (gera um histórico de migrations versionado):
```bash
npm run prisma:migrate -- --name init
node prisma/seed.js
```
Não use as duas abordagens ao mesmo tempo no mesmo banco — escolha `database.sql` OU `prisma migrate`.
