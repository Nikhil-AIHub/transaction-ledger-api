# Transaction Ledger API

A backend API for a simple transaction ledger. It lets you:
- create accounts
- post credit and debit transactions
- read balances and paginated transaction history
- **(bonus)** transfer money between accounts atomically

**Stack:** Node.js · Express 5 · PostgreSQL · `pg` · Zod · Node test runner + Supertest

| Document | Contents |
|---|---|
| [docs/API.md](docs/API.md) | Full API documentation with request/response examples |
| [docs/openapi.json](docs/openapi.json) | OpenAPI 3 spec, also served as Swagger UI at `/api-docs` |
| [ASSUMPTIONS.md](ASSUMPTIONS.md) | Assumptions and design decisions |
| [postman/Transaction-Ledger-API.postman_collection.json](postman/Transaction-Ledger-API.postman_collection.json) | Ready-to-run Postman collection |

---

## Features

**Accounts**
- A UUID id, a required name, a server-generated `created_at` and a balance that always starts at **0**.
- The client cannot set the balance.

**Transactions**
- `credit` increases the balance and `debit` decreases it.
- Debits that exceed the balance are rejected with `422`, and the balance is unchanged.
- `reference_id` is unique per account. A repeat returns `409` with the original transaction, creates nothing, and leaves the balance unchanged. The same reference may be used on different accounts.

**History**
- Filter by `type`.
- Paginate with `page` and `limit`, with full metadata (`page`, `limit`, `total_records`, `total_pages`, `has_next_page`, `has_previous_page`).
- Always sorted latest first.

**Data integrity**
- **Atomic:** the balance update and the transaction insert happen in one DB transaction.
- **Concurrency-safe:** the account row is locked with `SELECT … FOR UPDATE`, and the balance update is conditional.
- **Database constraints:**
  - `CHECK balance >= 0`
  - `CHECK amount > 0`
  - `UNIQUE (account_id, reference_id)`
  - Foreign key from transactions to accounts
  - An immutability trigger that blocks `UPDATE`/`DELETE` on transactions
- **Immutable transactions:** there are no edit or delete endpoints, and `PUT`/`PATCH`/`DELETE` return `405`.

**Validation and errors**
- Every input is validated.
- Every error uses the same JSON shape: `{ success: false, error: { code, message, details } }`.
- Appropriate HTTP status codes: 400, 404, 405, 409, 422, 500.

**Bonus: transfers**
- Debit and credit happen in one DB transaction.
- Both accounts are locked in a fixed order, so concurrent opposite transfers can't deadlock.
- A partial transfer is never possible.

**Tests**
- **82 automated tests** covering every requirement, including concurrency and rollback.

---

## Prerequisites

| Tool | Version |
|---|---|
| [Node.js](https://nodejs.org) | **22 or newer** (LTS recommended) |
| [PostgreSQL](https://www.postgresql.org/download/) | **13 or newer** (uses the built-in `gen_random_uuid()`) |

Check that both are installed:
```bash
node -v
psql --version
```

---

## Setup

### 1. Install dependencies
```bash
cd transaction-ledger-api
npm install
```

### 2. Create the databases
The app uses two databases: `ledger_db` for running the app and `ledger_test` for the automated tests. The tests empty their tables, so they are kept separate.

```bash
psql -U postgres -c "CREATE DATABASE ledger_db;"
psql -U postgres -c "CREATE DATABASE ledger_test;"
```
Enter your PostgreSQL password when prompted. You can also create both databases in pgAdmin by right-clicking **Databases → Create → Database**.

### 3. Configure environment variables
Copy the example file:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and replace `YOUR_PASSWORD` with your PostgreSQL password:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ledger_db
TEST_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ledger_test
```
If your password contains special characters such as `@ # % /`, URL-encode them. For example, `@` becomes `%40`.

### 4. Create the tables (run migrations)
```bash
npm run db:migrate
```
Expected output: `Applied migration: 001_initial_schema.sql`. It is safe to run again.

### 5. Start the server
```bash
npm start        # normal mode
npm run dev      # development mode, restarts on file changes
```
Expected output:
```
Transaction Ledger API running on http://localhost:3000
API docs (Swagger UI): http://localhost:3000/api-docs
```

To check it's working:
- Open http://localhost:3000/health. You should see `{"success":true,"data":{"status":"ok","database":"connected"}}`.
- Open http://localhost:3000/api-docs to try every endpoint from the browser.

---

## Running the tests

```bash
npm test
```
The tests use `TEST_DATABASE_URL`. They create the schema automatically and empty the tables before each test file. There are 82 tests across 5 files:

| File | Covers |
|---|---|
| `tests/accounts.test.js` | Account creation, validation, balance cannot be set, balance/404/invalid id, unknown routes |
| `tests/transactions.test.js` | Credit/debit rules, insufficient funds, balance-consistency example, decimal precision, duplicates, all validations, immutability (405 and DB trigger) |
| `tests/history.test.js` | Latest-first sorting, credit/debit filter, pagination metadata, page beyond end, invalid pagination/type |
| `tests/concurrency.test.js` | 20 parallel debits (no overdraft), 10 parallel duplicates (exactly 1 created), mixed traffic (balance equals ledger sum), rollback on failure |
| `tests/transfers.test.js` | Bonus transfer: success, insufficient funds, unknown accounts, same account, duplicates, concurrent opposite transfers (no deadlock, money conserved) |

---

## API overview

| Method | Endpoint | Success | Description |
|---|---|---|---|
| POST | `/api/accounts` | 201 | Create account `{ "name": "Alice" }` |
| GET | `/api/accounts/:accountId` | 200 | Get account |
| GET | `/api/accounts/:accountId/balance` | 200 | Get `{ account_id, balance }` |
| POST | `/api/accounts/:accountId/transactions` | 201 | Credit or debit |
| GET | `/api/accounts/:accountId/transactions?type=&page=&limit=` | 200 | History |
| GET | `/api/accounts/:accountId/transactions/:transactionId` | 200 | One transaction |
| POST | `/api/transfers` | 201 | **Bonus:** transfer |
| GET | `/health` | 200 | Health check |

Full details and examples are in **[docs/API.md](docs/API.md)**.

### Quick example

The commands below use curl on macOS/Linux, or Git Bash on Windows. In PowerShell, use the Postman collection or Swagger UI instead.

```bash
# 1. Create an account
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}'
# -> 201 {"success":true,"data":{"id":"<ACCOUNT_ID>","name":"Alice","balance":0,"created_at":"..."}}

# 2. Credit 100
curl -X POST http://localhost:3000/api/accounts/<ACCOUNT_ID>/transactions \
  -H "Content-Type: application/json" \
  -d '{"type":"credit","amount":100,"description":"Salary","reference_id":"INV-1001"}'
# -> 201 {"success":true,"data":{"transaction":{...},"balance":100}}

# 3. Debit 150 -> rejected, balance stays 100
curl -X POST http://localhost:3000/api/accounts/<ACCOUNT_ID>/transactions \
  -H "Content-Type: application/json" \
  -d '{"type":"debit","amount":150,"reference_id":"PAY-1"}'
# -> 422 {"success":false,"error":{"code":"INSUFFICIENT_BALANCE",...}}

# 4. Repeat step 2 -> duplicate, nothing changes
# -> 409 {"success":false,"error":{"code":"DUPLICATE_TRANSACTION",...}}

# 5. Balance and history
curl http://localhost:3000/api/accounts/<ACCOUNT_ID>/balance
curl "http://localhost:3000/api/accounts/<ACCOUNT_ID>/transactions?type=credit&page=1&limit=10"
```

### Using Postman
1. In Postman, click **Import** and choose `postman/Transaction-Ledger-API.postman_collection.json`.
2. Run the requests from top to bottom. The collection saves the created account ids into variables automatically, so later requests just work.
3. To run everything at once, use **Run collection**. Each request includes assertions.

---

## Project structure

```
transaction-ledger-api/
├── migrations/
│   └── 001_initial_schema.sql   # tables, constraints, indexes, immutability trigger
├── scripts/
│   └── migrate.js               # `npm run db:migrate`
├── src/
│   ├── app.js                   # Express app (middleware, routes, error handling)
│   ├── server.js                # starts the HTTP server, graceful shutdown
│   ├── config/
│   │   ├── env.js               # loads and checks environment variables
│   │   └── database.js          # pg pool + withTransaction() helper
│   ├── db/migrate.js            # migration runner
│   ├── routes/                  # URL -> middleware -> controller
│   ├── controllers/             # HTTP layer: read validated input, send response
│   ├── services/                # business logic
│   │   ├── ledger.js            # locking, duplicate check, conditional balance update + insert
│   │   ├── account.service.js
│   │   ├── transaction.service.js
│   │   └── transfer.service.js
│   ├── validators/              # Zod schemas for body, params and query
│   ├── middlewares/             # validate(), error handler, 404/405
│   └── utils/                   # AppError + error codes, serializers
├── tests/                       # 82 end-to-end tests (node:test + supertest)
├── docs/                        # API.md + openapi.json
├── postman/                     # Postman collection
├── .env.example
├── ASSUMPTIONS.md
└── README.md
```

**Request flow:**
```
route → validate (Zod) → controller → service (DB transaction + row lock) → PostgreSQL
                                 ↘ errors → errorHandler → consistent JSON error
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL is not set` | Create `.env` from `.env.example` (setup step 3). |
| `password authentication failed for user "postgres"` | The password in `.env` is wrong. |
| `database "ledger_db" does not exist` | Run setup step 2. |
| `relation "accounts" does not exist` | Run `npm run db:migrate`. |
| `connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL isn't running. On Windows, open **Services** and start `postgresql-x64-<version>`. |
| PowerShell: *running scripts is disabled on this system* | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| `EADDRINUSE: address already in use :::3000` | Another program is using port 3000. Change `PORT` in `.env`. |
