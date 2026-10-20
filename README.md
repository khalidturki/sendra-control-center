# Sendra Control Center

# Build Sendra Subscription Management

Build a professional, responsive web application called **Sendra Admin 2.0** using Lovable and Supabase.

## 1. Admin dashboard
Create a modern admin dashboard with:
- Total clients and subscriptions
- Pending, active, expired and suspended counts
- Total revenue from recorded subscription payments
- Successful sends and daily usage across clients
- Recent subscription activity
- Charts for subscription status and usage trends

Use real database data, not hard-coded demo numbers.

## 2. Subscription management
Create four pages or tabs:
- Pending
- Active
- Expired
- Suspended

Each should have searchable, filterable client tables showing client ID, name, contact, plan, price, subscription status, start date, expiry date, and usage.

Allow authorised admins to:
- Create a subscription
- Approve or reject a pending subscription
- Edit client and subscription details
- Renew or change a plan
- Suspend or reactivate a subscription
- Delete a subscription with a confirmation step

Record important administrative actions in an audit log.

## 3. Plan management
Create a Plans page where admins can add, edit, activate, deactivate and remove plans.

Initial plans:
- Starter: 200 successful sends per day
- Standard: 500 successful sends per day
- Professional: 1,000 successful sends per day
- Unlimited: no daily send-count limit

Allow admins to set each plan's name, price, daily limit, description and availability. Store all plan settings in Supabase.

The Android app's future Plans screen must be able to retrieve these plans from the API.

## 4. Subscription rules
Use these statuses: PENDING, ACTIVE, EXPIRED and SUSPENDED.

- PENDING: requires admin approval.
- ACTIVE: permits use while the subscription is valid and within its plan limits.
- EXPIRED: blocks automation because the subscription period has ended.
- SUSPENDED: blocks automation until an authorised admin reactivates it.

Daily send usage resets at midnight in a configurable timezone. Track daily usage separately from subscription expiry. Unlimited plans have no daily send cap but still respect expiry and suspension.

Only confirmed successful transactions count towards a plan's limit. Retries and failed transactions must not count. Prevent duplicate usage records for the same transaction.

## 5. Supabase database and security
Create appropriate tables for clients, plans, subscriptions, usage records, admin users and audit logs, with relationships, constraints and timestamps.

Configure Row Level Security (RLS). Only authenticated, authorised admins may manage subscriptions and plans. Never expose the Supabase service-role key in the frontend.

Prepare secure backend/API functions for future Android integration:
- Fetch available plans
- Verify a client's subscription
- Check expiry, suspension and daily allowance
- Record a confirmed successful transaction exactly once

Do not trust a client-provided subscription status or usage total. Validate permissions and transaction records on the server.

## 6. Design
Use a polished, modern SaaS dashboard design with a clean sidebar, attractive statistic cards, clear status indicators, searchable tables, responsive layouts, subtle animations and consistent typography. Make it look like a professional product, not a basic template.

## 7. Implementation requirements
First inspect the existing Lovable project and Supabase setup. Reuse existing resources where appropriate; do not overwrite unrelated data or create duplicate tables.

Implement the working database and admin authentication, not just a visual mock-up. Include loading, empty and error states, form validation and confirmation dialogs.

Do not integrate the Android app yet. Finish the admin website and database first, then report which database tables, security policies and API functions were actually created and tested.

## Android transaction reservation API

Migration `0006_transaction_reservations.sql` adds the customer transaction lifecycle. Apply it only through the existing project's reviewed database migration process; deploying this source does not apply the migration or enable Android automation.

- `POST /api/public/v1/transactions/reserve` — authenticated customer; requires `installation_id`, a lowercase SHA-256 `transaction_id` (never raw SMS text), and a UUID `attempt_id`. Database authorization verifies the owning customer, approved device, active unexpired subscription, duplicate state and daily allowance atomically. Only `authorized: true` permits execution. Retrying with the exact same customer, installation, transaction ID, and attempt ID returns the original reservation only while it remains unresolved; it never creates another reservation. Any different attempt or previously finalized/reconciled transaction is rejected. Use distinct transaction IDs for separate operations.
- `POST /api/public/v1/transactions/finalize` — authenticated owner; requires `reservation_id`, matching `transaction_id` and `installation_id`. `SUCCESS` finalizes and counts usage exactly once. `UNKNOWN` leaves the reservation active. Customer `FAILED` reports are not accepted as proof and cannot release allowance.
- `GET /api/public/v1/transactions/pending?limit=100` — admin-only list of unresolved reservations, containing opaque transaction hashes and identifiers only.
- `POST /api/public/v1/transactions/reconcile` — admin-only `SUCCESS` or `FAILED` reconciliation. A confirmed failure releases the reserved allowance; an uncertain result must remain unresolved.

For one incoming-money SMS that initiates two USSD operations, Android must reserve and finalize each operation separately using two stable, distinct transaction IDs (for example, IDs derived from the incoming SMS's stable deduplication identity plus the operation step). It must not start operation two until operation one is confirmed successful by the existing configured USSD success keyword. Each confirmed operation counts once; an unsuccessful response does not count. An interrupted/missing response remains unresolved and blocked from replay; it may be reported as `UNKNOWN`, but must never be reported as a confirmed `FAILED`. A service restart alone is not evidence that the USSD operation failed. The 898 message is input to the second operation only, never evidence that either operation succeeded. Preserve the existing SMS parsing, templates, keyword, Accessibility and Auto-BIN logic when implementing the Android caller.

The API checks that a customer owns the reservation and that its state permits the transition. A customer-reported success is counted against that customer's allowance; the server cannot independently prove a carrier/USSD result without a trusted provider callback. Failure releases therefore require an authenticated admin reconciliation. Never enable live automation until the migration and endpoints are applied and verified in the existing production project, then separately integrate Android with the reservation lifecycle.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/73c371fa-8b95-4134-a082-6f8aa09a4e0c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
