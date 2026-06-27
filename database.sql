-- ============================================================
-- SISTEMA DE GESTAO FINANCEIRA PESSOAL INTELIGENTE
-- database.sql — Etapa 3
-- Compativel com MySQL 8 / MariaDB / XAMPP / phpMyAdmin
-- Engine: InnoDB | Charset: utf8mb4
-- Nenhum dado ficticio e inserido aqui.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS financeiro_pessoal
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE financeiro_pessoal;

-- ------------------------------------------------------------
-- USERS — conta do usuario. Raiz de todo o isolamento multiusuario.
-- ------------------------------------------------------------
CREATE TABLE users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CATEGORIES — categorias de receita/despesa. user_id nulo = categoria padrao do sistema.
-- ------------------------------------------------------------
CREATE TABLE categories (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NULL,
  name        VARCHAR(80) NOT NULL,
  type        ENUM('income','expense') NOT NULL,
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_categories_user_name_type (user_id, name, type),
  KEY idx_categories_type (type)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- REFRESH_TOKENS — sessoes ativas (rotacao a cada uso).
-- ------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   VARCHAR(64) NOT NULL,
  expires_at   TIMESTAMP NOT NULL,
  revoked_at   TIMESTAMP NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PASSWORD_RESETS — fluxo de recuperacao de senha.
-- ------------------------------------------------------------
CREATE TABLE password_resets (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   VARCHAR(64) NOT NULL,
  expires_at   TIMESTAMP NOT NULL,
  used_at      TIMESTAMP NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_password_resets_hash (token_hash),
  KEY idx_password_resets_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MONTHS — unidade central do sistema. Cada mes e um snapshot fechavel.
-- ------------------------------------------------------------
CREATE TABLE months (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  month       TINYINT UNSIGNED NOT NULL,
  year        SMALLINT UNSIGNED NOT NULL,
  status      ENUM('open','closed') NOT NULL DEFAULT 'open',
  closed_at   TIMESTAMP NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_months_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_months_month CHECK (month BETWEEN 1 AND 12),
  UNIQUE KEY uq_months_user_month_year (user_id, month, year)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- INCOME_TEMPLATES — modelo de receita recorrente.
-- ------------------------------------------------------------
CREATE TABLE income_templates (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  description     VARCHAR(160) NOT NULL,
  value           DECIMAL(12,2) NOT NULL,
  category_id     BIGINT UNSIGNED NOT NULL,
  payment_method  ENUM('cash','pix','debit','credit','transfer') NOT NULL,
  active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_income_templates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_income_templates_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_income_templates_value CHECK (value > 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- INCOMES — instancia real de receita em um mes (nunca recalculada retroativamente).
-- ------------------------------------------------------------
CREATE TABLE incomes (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  month_id        BIGINT UNSIGNED NOT NULL,
  template_id     BIGINT UNSIGNED NULL,
  description     VARCHAR(160) NOT NULL,
  value           DECIMAL(12,2) NOT NULL,
  category_id     BIGINT UNSIGNED NOT NULL,
  payment_method  ENUM('cash','pix','debit','credit','transfer') NOT NULL,
  origin          ENUM('digital','physical') NOT NULL DEFAULT 'digital',
  income_date     DATE NOT NULL,
  observation     VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_incomes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_incomes_month FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE RESTRICT,
  CONSTRAINT fk_incomes_template FOREIGN KEY (template_id) REFERENCES income_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_incomes_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_incomes_value CHECK (value > 0),
  KEY idx_incomes_user_month (user_id, month_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- FIXED_EXPENSE_TEMPLATES — modelo de despesa fixa recorrente.
-- ------------------------------------------------------------
CREATE TABLE fixed_expense_templates (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  description  VARCHAR(160) NOT NULL,
  category_id  BIGINT UNSIGNED NOT NULL,
  value        DECIMAL(12,2) NOT NULL,
  due_day      TINYINT UNSIGNED NOT NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fixed_templates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fixed_templates_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_fixed_templates_value CHECK (value > 0),
  CONSTRAINT chk_fixed_templates_due_day CHECK (due_day BETWEEN 1 AND 31)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- DEBTS — contrato de divida (despesa prioridade), origem das parcelas em "expenses".
-- ------------------------------------------------------------
CREATE TABLE debts (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,
  description         VARCHAR(160) NOT NULL,
  category_id         BIGINT UNSIGNED NOT NULL,
  total_value         DECIMAL(12,2) NOT NULL,
  installments_count  SMALLINT UNSIGNED NOT NULL,
  installment_value   DECIMAL(12,2) NOT NULL,
  flexible_payment    TINYINT(1) NOT NULL DEFAULT 0,
  due_day             TINYINT UNSIGNED NOT NULL,
  status              ENUM('active','settled') NOT NULL DEFAULT 'active',
  remaining_balance   DECIMAL(12,2) NOT NULL,
  pending_carry_over  DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_debts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_debts_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_debts_total_value CHECK (total_value > 0),
  CONSTRAINT chk_debts_installments CHECK (installments_count >= 1),
  KEY idx_debts_user_status (user_id, status)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CARDS — cartoes de credito do usuario.
-- ------------------------------------------------------------
CREATE TABLE cards (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(80) NOT NULL,
  color        VARCHAR(20) NOT NULL DEFAULT '#6366F1',
  limit_value  DECIMAL(12,2) NOT NULL,
  closing_day  TINYINT UNSIGNED NOT NULL,
  due_day      TINYINT UNSIGNED NOT NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_cards_limit CHECK (limit_value > 0),
  CONSTRAINT chk_cards_closing_day CHECK (closing_day BETWEEN 1 AND 31),
  CONSTRAINT chk_cards_due_day CHECK (due_day BETWEEN 1 AND 31)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CARD_PURCHASES — contrato da compra parcelada no cartao.
-- ------------------------------------------------------------
CREATE TABLE card_purchases (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,
  card_id             BIGINT UNSIGNED NOT NULL,
  description         VARCHAR(160) NOT NULL,
  category_id         BIGINT UNSIGNED NOT NULL,
  total_value         DECIMAL(12,2) NOT NULL,
  installments_count  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  installment_value   DECIMAL(12,2) NOT NULL,
  purchase_date       DATE NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_card_purchases_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_card_purchases_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT,
  CONSTRAINT fk_card_purchases_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_card_purchases_value CHECK (total_value > 0),
  KEY idx_card_purchases_card (card_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CARD_INVOICES — fatura mensal de cada cartao.
-- ------------------------------------------------------------
CREATE TABLE card_invoices (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_id           BIGINT UNSIGNED NOT NULL,
  month_id          BIGINT UNSIGNED NOT NULL,
  reference_month   TINYINT UNSIGNED NOT NULL,
  reference_year    SMALLINT UNSIGNED NOT NULL,
  closing_date      DATE NOT NULL,
  due_date          DATE NOT NULL,
  total_value       DECIMAL(12,2) NOT NULL DEFAULT 0,
  status            ENUM('open','closed','paid') NOT NULL DEFAULT 'open',
  paid_at           TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_card_invoices_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT,
  CONSTRAINT fk_card_invoices_month FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_card_invoices_card_ref (card_id, reference_month, reference_year)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- EXPENSES — instancia unica para os 4 tipos de despesa (priority/fixed/variable/card).
-- ------------------------------------------------------------
CREATE TABLE expenses (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            BIGINT UNSIGNED NOT NULL,
  month_id           BIGINT UNSIGNED NOT NULL,
  type               ENUM('priority','fixed','variable','card') NOT NULL,
  description        VARCHAR(160) NOT NULL,
  category_id        BIGINT UNSIGNED NOT NULL,
  due_date            DATE NOT NULL,
  value              DECIMAL(12,2) NOT NULL,
  paid_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  status             ENUM('pending','partial','paid','late','settled') NOT NULL DEFAULT 'pending',
  payment_method     ENUM('cash','pix','debit','credit','transfer') NULL,
  fixed_template_id  BIGINT UNSIGNED NULL,
  debt_id            BIGINT UNSIGNED NULL,
  card_invoice_id    BIGINT UNSIGNED NULL,
  card_purchase_id   BIGINT UNSIGNED NULL,
  observation        VARCHAR(255) NULL,
  deleted_at         TIMESTAMP NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_expenses_month FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_fixed_template FOREIGN KEY (fixed_template_id) REFERENCES fixed_expense_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_expenses_debt FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_card_invoice FOREIGN KEY (card_invoice_id) REFERENCES card_invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_card_purchase FOREIGN KEY (card_purchase_id) REFERENCES card_purchases(id) ON DELETE RESTRICT,
  CONSTRAINT chk_expenses_value CHECK (value > 0),
  KEY idx_expenses_user_month_type (user_id, month_id, type),
  KEY idx_expenses_user_status (user_id, status)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SAVINGS_TRANSACTIONS — saldo guardado (reserva), historico imutavel.
-- ------------------------------------------------------------
CREATE TABLE savings_transactions (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL,
  type           ENUM('deposit','withdraw') NOT NULL,
  value          DECIMAL(12,2) NOT NULL,
  transaction_date DATE NOT NULL,
  observation    VARCHAR(255) NULL,
  balance_after  DECIMAL(12,2) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_savings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_savings_value CHECK (value > 0),
  KEY idx_savings_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- GOALS — metas financeiras (independentes do ciclo mensal).
-- ------------------------------------------------------------
CREATE TABLE goals (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(120) NOT NULL,
  description   VARCHAR(255) NULL,
  target_value  DECIMAL(12,2) NOT NULL,
  target_date   DATE NULL,
  status        ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_goals_target_value CHECK (target_value > 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- GOAL_CONTRIBUTIONS — aportes/devolucoes em metas. Impacta saldo atual do mes referido.
-- ------------------------------------------------------------
CREATE TABLE goal_contributions (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  goal_id           BIGINT UNSIGNED NOT NULL,
  month_id          BIGINT UNSIGNED NOT NULL,
  value             DECIMAL(12,2) NOT NULL,
  type              ENUM('contribution','refund') NOT NULL DEFAULT 'contribution',
  contribution_date DATE NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_goal_contributions_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  CONSTRAINT fk_goal_contributions_month FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE RESTRICT,
  CONSTRAINT chk_goal_contributions_value CHECK (value > 0),
  KEY idx_goal_contributions_goal (goal_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ALERTS — alertas inteligentes baseados em regras, por mes.
-- ------------------------------------------------------------
CREATE TABLE alerts (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  month_id    BIGINT UNSIGNED NOT NULL,
  type        VARCHAR(60) NOT NULL,
  severity    ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  message     VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at     TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  CONSTRAINT fk_alerts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_alerts_month FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE CASCADE,
  UNIQUE KEY uq_alerts_user_month_type (user_id, month_id, type),
  KEY idx_alerts_user_month (user_id, month_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- FINANCIAL_HEALTH_SCORES — pontuacao 0-100 por mes, com detalhamento.
-- ------------------------------------------------------------
CREATE TABLE financial_health_scores (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  month_id        BIGINT UNSIGNED NOT NULL,
  score           TINYINT UNSIGNED NOT NULL,
  breakdown_json  JSON NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_health_scores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_health_scores_month FOREIGN KEY (month_id) REFERENCES months(id) ON DELETE CASCADE,
  UNIQUE KEY uq_health_scores_user_month (user_id, month_id),
  CONSTRAINT chk_health_scores_score CHECK (score BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- AUDIT_LOG — rastreabilidade completa de alteracoes financeiras.
-- ------------------------------------------------------------
CREATE TABLE audit_log (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  entity          VARCHAR(60) NOT NULL,
  entity_id       BIGINT UNSIGNED NOT NULL,
  action          VARCHAR(40) NOT NULL,
  old_value_json  JSON NULL,
  new_value_json  JSON NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_audit_log_entity (entity, entity_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SIMULATIONS — cenarios salvos do simulador "E Se" (Modulo 4). Nunca altera
-- dados reais; input_json guarda os parametros especificos de cada tipo de
-- cenario (ex.: debt_id e valor para "antecipar parcelas").
-- ------------------------------------------------------------
CREATE TABLE simulations (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  type         ENUM('pay_debt','anticipate_installments','save_monthly','reduce_category','cancel_subscription','increase_income') NOT NULL,
  name         VARCHAR(160) NOT NULL,
  input_json   JSON NOT NULL,
  months_ahead SMALLINT UNSIGNED NOT NULL DEFAULT 12,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_simulations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_simulations_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SIMULATION_RESULTS — projecao mes a mes (baseline vs. cenario) de cada simulacao salva.
-- ------------------------------------------------------------
CREATE TABLE simulation_results (
  id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  simulation_id        BIGINT UNSIGNED NOT NULL,
  month_index          SMALLINT UNSIGNED NOT NULL,
  month                TINYINT UNSIGNED NOT NULL,
  year                 SMALLINT UNSIGNED NOT NULL,
  baseline_net         DECIMAL(12,2) NOT NULL,
  scenario_net         DECIMAL(12,2) NOT NULL,
  difference           DECIMAL(12,2) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_simulation_results_simulation FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_simulation_results_sim_index (simulation_id, month_index)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
