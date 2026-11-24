-- v30 additive migration: individual teacher plans. CREATE ... IF NOT EXISTS only; touches no existing table.
CREATE TABLE IF NOT EXISTS individual_accounts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
    stripe_customer_id TEXT UNIQUE, plan_key TEXT, recovery_hash TEXT,
    confirm_session_id TEXT, confirm_used_at TEXT, terms_version TEXT, terms_accepted_at TEXT,
    paused_reason TEXT, signin_fails INTEGER NOT NULL DEFAULT 0, signin_locked_until TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT, delete_after TEXT);
CREATE TABLE IF NOT EXISTS individual_subscriptions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, plan_key TEXT, price_id TEXT, status TEXT NOT NULL,
    current_period_start TEXT, current_period_end TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS individual_subscriptions_acct ON individual_subscriptions(account_id);
CREATE TABLE IF NOT EXISTS individual_periods (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, stripe_invoice_id TEXT UNIQUE, kind TEXT NOT NULL, plan_key TEXT,
    period_start TEXT NOT NULL, period_end TEXT NOT NULL, papers_allowed INTEGER NOT NULL, papers_used INTEGER NOT NULL DEFAULT 0,
    amount_paid INTEGER, voided INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS individual_periods_acct ON individual_periods(account_id, period_end);
CREATE TABLE IF NOT EXISTS individual_usage (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
    paper_key TEXT, input_tokens INTEGER, output_tokens INTEGER, created_at TEXT NOT NULL, settled_at TEXT);
CREATE INDEX IF NOT EXISTS individual_usage_acct ON individual_usage(account_id, created_at);
CREATE INDEX IF NOT EXISTS individual_usage_key ON individual_usage(account_id, paper_key);
CREATE TABLE IF NOT EXISTS individual_sessions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT);
CREATE INDEX IF NOT EXISTS individual_sessions_acct ON individual_sessions(account_id);
CREATE TABLE IF NOT EXISTS individual_credit_flags (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, usage_id TEXT NOT NULL UNIQUE, reason TEXT NOT NULL,
    restored INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS individual_daily_free (
    account_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, day, kind));
CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, livemode INTEGER NOT NULL, received_at TEXT NOT NULL,
    processed_at TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS ai_cost_daily (
    day TEXT NOT NULL, scope TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, scope));

