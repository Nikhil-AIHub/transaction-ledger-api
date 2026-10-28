-- 001_initial_schema.sql
-- Accounts and transactions for the ledger.
-- Integrity rules are enforced by the database itself, not only by application code.

CREATE TYPE transaction_type AS ENUM ('credit', 'debit');

CREATE TABLE accounts (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255)  NOT NULL,
    -- Money is stored as an exact decimal, never as a float.
    balance     NUMERIC(18,2) NOT NULL DEFAULT 0,
    -- clock_timestamp() (not now()) so rows inserted in the same DB transaction get distinct times.
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT accounts_name_not_blank   CHECK (length(btrim(name)) > 0),
    -- Last line of defence: a balance can never go negative, even if application code had a bug.
    CONSTRAINT accounts_balance_non_negative CHECK (balance >= 0)
);

CREATE TABLE transactions (
    id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID             NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    type          transaction_type NOT NULL,
    amount        NUMERIC(18,2)    NOT NULL,
    description   VARCHAR(500),
    reference_id  VARCHAR(100)     NOT NULL,
    -- Set only for the two legs of a money transfer; links them together.
    transfer_id   UUID,
    created_at    TIMESTAMPTZ      NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT transactions_amount_positive        CHECK (amount > 0),
    CONSTRAINT transactions_reference_not_blank    CHECK (length(btrim(reference_id)) > 0),
    -- Duplicate protection: a reference_id may appear only once per account
    -- (the same reference_id is allowed on different accounts).
    CONSTRAINT transactions_account_reference_unique UNIQUE (account_id, reference_id)
);

-- Transaction history: filter by account (and optionally type), newest first.
CREATE INDEX idx_transactions_account_created
    ON transactions (account_id, created_at DESC, id DESC);
CREATE INDEX idx_transactions_account_type_created
    ON transactions (account_id, type, created_at DESC, id DESC);
CREATE INDEX idx_transactions_transfer
    ON transactions (transfer_id) WHERE transfer_id IS NOT NULL;

-- Immutability: once written, a transaction row can never be changed or removed,
-- even by code that bypasses the API.
CREATE FUNCTION prevent_transaction_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Transactions are immutable: % is not allowed', TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_immutable
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation();
