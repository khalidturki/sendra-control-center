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
