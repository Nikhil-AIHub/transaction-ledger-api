# API Documentation

Base URL: `http://localhost:3000`

Interactive docs (Swagger UI): **http://localhost:3000/api-docs**. The raw OpenAPI spec is at `/api-docs.json` and in [`docs/openapi.json`](./openapi.json).

## Conventions

- Requests and responses are JSON. Send `Content-Type: application/json` with every request body.
- Field names are `snake_case`. IDs are UUIDs. Timestamps are ISO 8601 in UTC.
- Amounts are JSON **numbers** greater than 0 with **at most 2 decimal places** (max `1000000000`). Strings such as `"50"` are rejected.
- Unknown fields in a request body are rejected. This is how clients are prevented from setting `balance`, `id` or `created_at`.

**Success response:**
```json
{ "success": true, "data": { } }
```

**Error response** (the same shape for every error):
```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human readable message",
    "details": "optional: array of field errors, or an object with context"
  }
}
```

## Endpoint summary

| Method | Path | Description |
|---|---|---|
| POST | `/api/accounts` | Create an account |
| GET | `/api/accounts/{accountId}` | Get an account |
| GET | `/api/accounts/{accountId}/balance` | Get the current balance |
| POST | `/api/accounts/{accountId}/transactions` | Add a credit or debit |
| GET | `/api/accounts/{accountId}/transactions` | Transaction history (filter, paginate, latest first) |
| GET | `/api/accounts/{accountId}/transactions/{transactionId}` | Get one transaction |
| PUT, PATCH, DELETE | `/api/accounts/{accountId}/transactions/{transactionId}` | Always `405`, because transactions are immutable |
| POST | `/api/transfers` | **Bonus:** atomic transfer between accounts |
| GET | `/health` | Health check (server and database) |

---

## 1. Create account

`POST /api/accounts`

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | Trimmed, 1–255 characters |

**Request**
```json
{ "name": "Alice" }
```

**201 Created** (also sets the `Location: /api/accounts/{id}` header)
```json
{
  "success": true,
  "data": {
    "id": "99fe8f5d-f39a-4d97-81c2-092c7d47c934",
    "name": "Alice",
    "balance": 0,
    "created_at": "2026-10-28T12:18:00.516Z"
  }
}
```

**400**: trying to set the balance:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "balance is set by the server and cannot be provided by the client",
    "details": [
      { "location": "body", "field": "balance", "message": "balance is set by the server and cannot be provided by the client" }
    ]
  }
}
```

---

## 2. Get account / Get balance

`GET /api/accounts/{accountId}` returns the full account, in the same shape as the create response.

`GET /api/accounts/{accountId}/balance`

**200 OK**
```json
{ "success": true, "data": { "account_id": "99fe8f5d-f39a-4d97-81c2-092c7d47c934", "balance": 100 } }
```

**404**: unknown account:
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "Account not found",
    "details": { "account_id": "00000000-0000-4000-8000-000000000000" }
  }
}
```

**400**: malformed id, for example `/api/accounts/abc/balance`, returns `INVALID_ACCOUNT_ID`.

---

## 3. Add transaction

`POST /api/accounts/{accountId}/transactions`

| Field | Type | Required | Rules |
|---|---|---|---|
| `type` | string | yes | `credit` or `debit` |
| `amount` | number | yes | > 0, at most 2 decimals, ≤ 1,000,000,000 |
| `reference_id` | string | yes | Trimmed, 1–100 characters, **unique per account** |
| `description` | string or null | no | ≤ 500 characters |

**Request**
```json
{ "type": "credit", "amount": 100, "description": "salary", "reference_id": "r1" }
```

**201 Created**: returns the transaction and the new balance:
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": "f5cb589c-0919-496a-97f6-32b54e24ba33",
      "account_id": "99fe8f5d-f39a-4d97-81c2-092c7d47c934",
      "type": "credit",
      "amount": 100,
      "description": "salary",
      "reference_id": "r1",
      "transfer_id": null,
      "created_at": "2026-10-28T12:18:00.568Z"
    },
    "balance": 100
  }
}
```

**422**: insufficient balance. Nothing is recorded and the balance is unchanged.
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance for this debit",
    "details": { "account_id": "99fe8f5d-...", "current_balance": 100, "requested_amount": 150 }
  }
}
```

**409**: duplicate `reference_id` for this account. No new transaction is created and the balance is unchanged. The original transaction is returned in `details`.
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_TRANSACTION",
    "message": "A transaction with this reference_id already exists for this account",
    "details": { "transaction": { "id": "f5cb589c-...", "type": "credit", "amount": 100, "reference_id": "r1", "...": "..." } }
  }
}
```

**400**: validation. When every invalid field belongs to one category, a specific code is used: `INVALID_TRANSACTION_TYPE`, `INVALID_AMOUNT` or `INVALID_ACCOUNT_ID`. Otherwise the code is `VALIDATION_ERROR`, and every problem is listed:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "amount must be greater than 0",
    "details": [ { "location": "body", "field": "amount", "message": "amount must be greater than 0" } ]
  }
}
```

**404**: `ACCOUNT_NOT_FOUND`.

---

## 4. Transaction history

`GET /api/accounts/{accountId}/transactions?type=&page=&limit=`

| Query | Default | Rules |
|---|---|---|
| `type` | (both) | `credit` or `debit` |
| `page` | `1` | Positive integer |
| `limit` | `10` | Positive integer, maximum `100` |

Results are sorted **latest first** by `created_at`, with `id` as a tie-breaker.

**200 OK**: `GET /api/accounts/{id}/transactions?type=credit&page=2&limit=2`
```json
{
  "success": true,
  "data": [
    { "id": "...", "account_id": "...", "type": "credit", "amount": 10, "description": null, "reference_id": "H-4", "transfer_id": null, "created_at": "2026-10-28T12:20:01.120Z" },
    { "id": "...", "account_id": "...", "type": "credit", "amount": 50, "description": null, "reference_id": "H-2", "transfer_id": null, "created_at": "2026-10-28T12:20:01.090Z" }
  ],
  "pagination": {
    "page": 2,
    "limit": 2,
    "total_records": 5,
    "total_pages": 3,
    "has_next_page": true,
    "has_previous_page": true
  },
  "filters": { "type": "credit" }
}
```

A page beyond the last one returns `data: []` with correct totals.

**400**: `INVALID_PAGINATION` for `page`/`limit` values such as `0`, `-1`, `1.5`, `abc` or a `limit` above `100`. `INVALID_TRANSACTION_TYPE` for an unknown `type`.
**404**: `ACCOUNT_NOT_FOUND`.

---

## 5. Get one transaction / immutability

`GET /api/accounts/{accountId}/transactions/{transactionId}` returns `200` with the transaction, or `404 TRANSACTION_NOT_FOUND`.

`PUT`, `PATCH` and `DELETE` on the same path always return:
```
HTTP/1.1 405 Method Not Allowed
Allow: GET
```
```json
{ "success": false, "error": { "code": "METHOD_NOT_ALLOWED", "message": "Transactions are immutable and cannot be modified or deleted" } }
```
A database trigger also blocks `UPDATE`/`DELETE` on the `transactions` table. See [ASSUMPTIONS.md](../ASSUMPTIONS.md).

---

## 6. Transfer (bonus)

`POST /api/transfers`

| Field | Type | Required | Rules |
|---|---|---|---|
| `from_account_id` | UUID | yes | Must exist |
| `to_account_id` | UUID | yes | Must exist, and differ from the source |
| `amount` | number | yes | Same rules as transactions |
| `reference_id` | string | yes | Must be unused on **both** accounts |
| `description` | string | no | Defaults to "Transfer to/from account …" |

**Request**
```json
{ "from_account_id": "<A>", "to_account_id": "<B>", "amount": 30, "reference_id": "TRF-1" }
```

**201 Created**: A had 100 and B had 50:
```json
{
  "success": true,
  "data": {
    "transfer_id": "4c0f0f0e-6a3b-4e44-9d8c-0a5b8f1d2e33",
    "amount": 30,
    "reference_id": "TRF-1",
    "from_account": { "account_id": "<A>", "balance": 70 },
    "to_account":   { "account_id": "<B>", "balance": 80 },
    "transactions": {
      "debit":  { "id": "...", "account_id": "<A>", "type": "debit",  "amount": 30, "transfer_id": "4c0f0f0e-...", "...": "..." },
      "credit": { "id": "...", "account_id": "<B>", "type": "credit", "amount": 30, "transfer_id": "4c0f0f0e-...", "...": "..." }
    }
  }
}
```

**Errors:**
- `400` `VALIDATION_ERROR`, including when both accounts are the same.
- `404` `ACCOUNT_NOT_FOUND`, with `details.account_id` naming the missing account.
- `409` `DUPLICATE_TRANSACTION`.
- `422` `INSUFFICIENT_BALANCE`.

In every error case, neither account changes.

---

## Error codes and HTTP status

| HTTP | `error.code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid or missing fields, unknown fields, several kinds of problems at once |
| 400 | `INVALID_JSON` | Malformed JSON body |
| 400 | `INVALID_ACCOUNT_ID` | Account id is not a valid UUID |
| 400 | `INVALID_TRANSACTION_TYPE` | `type` is not `credit`/`debit` |
| 400 | `INVALID_AMOUNT` | Amount ≤ 0, not a number, more than 2 decimals, too large |
| 400 | `INVALID_PAGINATION` | Bad `page` / `limit` |
| 404 | `ACCOUNT_NOT_FOUND` | Account does not exist |
| 404 | `TRANSACTION_NOT_FOUND` | Transaction does not exist on that account |
| 404 | `ROUTE_NOT_FOUND` | Unknown URL |
| 405 | `METHOD_NOT_ALLOWED` | Trying to modify or delete a transaction |
| 409 | `DUPLICATE_TRANSACTION` | `reference_id` already used on the account |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 kb |
| 422 | `INSUFFICIENT_BALANCE` | Debit or transfer exceeds the balance |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected error (details are logged, not exposed) |
| 503 | `SERVICE_UNAVAILABLE` | Health check cannot reach the database |
