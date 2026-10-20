import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

type ReservationResult = {
  already_counted?: boolean;
  authorized?: boolean;
  already_finalized?: boolean;
  counted?: boolean;
  finalized?: boolean;
  reason?: string;
  reservation_id?: string;
  reserved?: boolean;
};

const databaseUrl = process.env["SENDRA_TEST_DATABASE_URL"];
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    !parsed.pathname.toLowerCase().includes("test")
  ) {
    throw new Error("SENDRA_TEST_DATABASE_URL must point to a local disposable test database.");
  }
}

const database = databaseUrl ? postgres(databaseUrl, { max: 4, onnotice: () => {} }) : null;

type Fixture = {
  userId: string;
  adminId: string;
  clientId: string;
  planId: string;
  subscriptionId: string;
  installationId: string;
};

const fixtures: Fixture[] = [];
const dbDescribe = database ? describe : describe.skip;

function transactionId(seed: number): string {
  return seed.toString(16).padStart(64, "0");
}

async function createFixture(dailyLimit: number): Promise<Fixture> {
  if (!database) throw new Error("Test database is not configured.");
  const fixture: Fixture = {
    userId: crypto.randomUUID(),
    adminId: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    planId: crypto.randomUUID(),
    subscriptionId: crypto.randomUUID(),
    installationId: `test-install-${crypto.randomUUID()}`,
  };
  const email = `reservation-${fixture.userId}@example.invalid`;
  const adminEmail = `reservation-admin-${fixture.adminId}@example.invalid`;
  await database`
    INSERT INTO auth.users
      (id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES
      (${fixture.userId}, 'authenticated', 'authenticated', ${email}, '',
       now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      (${fixture.adminId}, 'authenticated', 'authenticated', ${adminEmail}, '',
       now(), '{}'::jsonb, '{}'::jsonb, now(), now())
  `;
  await database`
    INSERT INTO public.user_roles (user_id, role, email)
    VALUES (${fixture.adminId}, 'admin', ${adminEmail})
  `;
  await database`
    INSERT INTO public.plans (id, name, daily_limit, duration_days)
    VALUES (${fixture.planId}, ${`Reservation test ${fixture.planId}`}, ${dailyLimit}, 30)
  `;
  await database`
    INSERT INTO public.clients (id, user_id, name, email)
    VALUES (${fixture.clientId}, ${fixture.userId}, 'Reservation test', ${email})
  `;
  await database`
    INSERT INTO public.subscriptions
      (id, client_id, plan_id, status, price, start_date, expiry_date)
    VALUES
      (${fixture.subscriptionId}, ${fixture.clientId}, ${fixture.planId},
       'ACTIVE', 0, now() - interval '1 day', now() + interval '30 days')
  `;
  await database`
    INSERT INTO public.devices (client_id, installation_id, status)
    VALUES (${fixture.clientId}, ${fixture.installationId}, 'APPROVED')
  `;
  fixtures.push(fixture);
  return fixture;
}

async function reserve(
  connection: NonNullable<typeof database>,
  fixture: Fixture,
  txId: string,
  attemptId = crypto.randomUUID(),
): Promise<ReservationResult> {
  const [row] = await connection<[{ result: ReservationResult }]>`
    SELECT public.customer_reserve_transaction(
      ${fixture.installationId}, ${txId}, ${attemptId}::uuid
    ) AS result
  `;
  return row.result;
}

async function reserveFor(
  fixture: Fixture,
  txId: string,
  attemptId = crypto.randomUUID(),
): Promise<ReservationResult> {
  if (!database) throw new Error("Test database is not configured.");
  const connection = await database.reserve();
  try {
    await setAuthenticatedUser(connection, fixture.userId);
    return await reserve(connection, fixture, txId, attemptId);
  } finally {
    connection.release();
  }
}

async function finalizeFor(
  fixture: Fixture,
  reservationId: string,
  txId: string,
  outcome: "SUCCESS" | "UNKNOWN",
): Promise<ReservationResult> {
  if (!database) throw new Error("Test database is not configured.");
  const connection = await database.reserve();
  try {
    await setAuthenticatedUser(connection, fixture.userId);
    const [row] = await connection<[{ result: ReservationResult }]>`
      SELECT public.customer_finalize_transaction(
        ${fixture.installationId}, ${reservationId}::uuid, ${txId}, ${outcome}
      ) AS result
    `;
    return row.result;
  } finally {
    connection.release();
  }
}

async function setAuthenticatedUser(
  connection: NonNullable<typeof database>,
  userId: string,
): Promise<void> {
  await connection`
    SELECT set_config('request.jwt.claim.sub', ${userId}, false),
           set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, false)
  `;
}

dbDescribe("transaction reservation database integration", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture(1);
  });

  afterEach(async () => {
    if (!database) return;
    for (const item of fixtures.splice(0)) {
      await database`DELETE FROM public.clients WHERE id = ${item.clientId}`;
      await database`DELETE FROM public.plans WHERE id = ${item.planId}`;
      await database`DELETE FROM auth.users WHERE id IN (${item.userId}, ${item.adminId})`;
    }
  });

  it("serializes concurrent reservations so a one-send allowance authorizes only one", async () => {
    if (!database) return;
    const first = await database.reserve();
    const second = await database.reserve();
    try {
      await Promise.all([
        setAuthenticatedUser(first, fixture.userId),
        setAuthenticatedUser(second, fixture.userId),
      ]);
      const [left, right] = await Promise.all([
        reserve(first, fixture, transactionId(1)),
        reserve(second, fixture, transactionId(2)),
      ]);
      expect([left.authorized, right.authorized].filter(Boolean)).toHaveLength(1);
      expect([left.reason, right.reason]).toContain("DAILY_LIMIT_REACHED");
    } finally {
      first.release();
      second.release();
    }
  });

  it("replays the original reservation only for the exact same transaction and attempt", async () => {
    if (!database) return;
    const attemptId = crypto.randomUUID();
    const idempotentRetries = await Promise.all([
      reserveFor(fixture, transactionId(3), attemptId),
      reserveFor(fixture, transactionId(3), attemptId),
    ]);
    expect(idempotentRetries.every((result) => result.authorized)).toBe(true);
    expect(idempotentRetries[0].reservation_id).toBe(idempotentRetries[1].reservation_id);
    expect((await reserveFor(fixture, transactionId(3))).reason).toBe("DUPLICATE_TRANSACTION");
    expect((await reserveFor(fixture, transactionId(4), attemptId)).reason).toBe(
      "ATTEMPT_ALREADY_USED",
    );

    const reservationId = idempotentRetries[0].reservation_id;
    if (!reservationId) throw new Error("Reservation response omitted its id.");
    const connection = await database.reserve();
    try {
      await setAuthenticatedUser(connection, fixture.adminId);
      await connection`
        SELECT public.admin_reconcile_transaction(${reservationId}::uuid, 'FAILED')
      `;
    } finally {
      connection.release();
    }
    expect((await reserveFor(fixture, transactionId(3))).reason).toBe("DUPLICATE_TRANSACTION");
  });

  it("rejects an unapproved installation", async () => {
    if (!database) return;
    await database`
      UPDATE public.devices SET status = 'PENDING'
      WHERE client_id = ${fixture.clientId}
    `;
    expect((await reserveFor(fixture, transactionId(5))).reason).toBe("DEVICE_NOT_APPROVED");
  });

  it("rejects an expired subscription", async () => {
    if (!database) return;
    await database`
      UPDATE public.subscriptions SET expiry_date = now() - interval '1 day'
      WHERE id = ${fixture.subscriptionId}
    `;
    expect((await reserveFor(fixture, transactionId(6))).reason).toBe("NO_ACTIVE_SUBSCRIPTION");
  });

  it("counts active reservations against the daily allowance", async () => {
    if (!database) return;
    expect((await reserveFor(fixture, transactionId(7))).authorized).toBe(true);
    expect((await reserveFor(fixture, transactionId(8))).reason).toBe("DAILY_LIMIT_REACHED");
  });

  it("authorizes and counts two distinct operations from one source independently", async () => {
    if (!database) return;
    await database`UPDATE public.plans SET daily_limit = 2 WHERE id = ${fixture.planId}`;
    const firstTxId = transactionId(11);
    const secondTxId = transactionId(12);
    const first = await reserveFor(fixture, firstTxId);
    const second = await reserveFor(fixture, secondTxId);
    expect(first.authorized).toBe(true);
    expect(second.authorized).toBe(true);
    if (!first.reservation_id || !second.reservation_id) {
      throw new Error("Reservation response omitted its id.");
    }

    expect((await finalizeFor(fixture, first.reservation_id, firstTxId, "SUCCESS")).counted).toBe(
      true,
    );
    expect((await finalizeFor(fixture, second.reservation_id, secondTxId, "SUCCESS")).counted).toBe(
      true,
    );
    expect(
      (await finalizeFor(fixture, first.reservation_id, firstTxId, "SUCCESS")).already_finalized,
    ).toBe(true);
    const [usage] = await database<[{ count: number }]>`
      SELECT count(*)::integer AS count FROM public.usage_records
      WHERE client_id = ${fixture.clientId} AND usage_date = public.usage_today()
    `;
    expect(usage.count).toBe(2);
    expect((await reserveFor(fixture, transactionId(13))).reason).toBe("DAILY_LIMIT_REACHED");
  });

  it("treats an existing usage row as already counted during success finalization", async () => {
    if (!database) return;
    const txId = transactionId(14);
    const reservation = await reserveFor(fixture, txId);
    if (!reservation.reservation_id) throw new Error("Reservation response omitted its id.");

    await database`
      INSERT INTO public.usage_records (client_id, subscription_id, transaction_id, usage_date)
      VALUES (${fixture.clientId}, ${fixture.subscriptionId}, ${txId}, public.usage_today())
    `;
    const finalized = await finalizeFor(fixture, reservation.reservation_id, txId, "SUCCESS");
    expect(finalized.finalized).toBe(true);
    expect(finalized.counted).toBe(false);
    expect(finalized.already_counted).toBe(true);
    const [usage] = await database<[{ count: number }]>`
      SELECT count(*)::integer AS count FROM public.usage_records
      WHERE client_id = ${fixture.clientId} AND transaction_id = ${txId}
    `;
    expect(usage.count).toBe(1);
  });

  it("keeps interrupted transactions reserved until admin reconciliation", async () => {
    if (!database) return;
    const connection = await database.reserve();
    try {
      await setAuthenticatedUser(connection, fixture.userId);
      const txId = transactionId(9);
      const first = await reserve(connection, fixture, txId);
      expect(first.authorized).toBe(true);
      if (!first.reservation_id) throw new Error("Reservation response omitted its id.");

      const unknown = await connection<[{ result: ReservationResult }]>`
        SELECT public.customer_finalize_transaction(
          ${fixture.installationId}, ${first.reservation_id}::uuid, ${txId}, 'UNKNOWN'
        ) AS result
      `;
      expect(unknown[0].result.reserved).toBe(true);
      expect((await reserve(connection, fixture, txId)).reason).toBe("DUPLICATE_TRANSACTION");

      const falseFailure = await connection<[{ result: ReservationResult }]>`
        SELECT public.customer_finalize_transaction(
          ${fixture.installationId}, ${first.reservation_id}::uuid, ${txId}, 'FAILED'
        ) AS result
      `;
      expect(falseFailure[0].result.reason).toBe("INVALID_REQUEST");

      await setAuthenticatedUser(connection, fixture.adminId);
      const [unknownState] = await connection<[{ outcome: string | null }]>`
        SELECT outcome FROM public.transaction_reservations
        WHERE id = ${first.reservation_id}::uuid
      `;
      expect(unknownState.outcome).toBe("UNKNOWN");
      const reconciled = await connection<[{ result: ReservationResult }]>`
        SELECT public.admin_reconcile_transaction(
          ${first.reservation_id}::uuid, 'FAILED'
        ) AS result
      `;
      expect(reconciled[0].result.reason).toBe("OK");
      await setAuthenticatedUser(connection, fixture.userId);
      expect((await reserve(connection, fixture, txId)).reason).toBe("DUPLICATE_TRANSACTION");
      expect((await reserve(connection, fixture, transactionId(10))).authorized).toBe(true);
    } finally {
      connection.release();
    }
  });

  it("does not let one customer finalize another customer's reservation", async () => {
    if (!database) return;
    const other = await createFixture(1);
    const connection = await database.reserve();
    try {
      await setAuthenticatedUser(connection, fixture.userId);
      const txId = transactionId(10);
      const created = await reserve(connection, fixture, txId);
      if (!created.reservation_id) throw new Error("Reservation response omitted its id.");

      await setAuthenticatedUser(connection, other.userId);
      const result = await connection<[{ result: ReservationResult }]>`
        SELECT public.customer_finalize_transaction(
          ${other.installationId}, ${created.reservation_id}::uuid, ${txId}, 'SUCCESS'
        ) AS result
      `;
      expect(result[0].result.reason).toBe("RESERVATION_NOT_FOUND");
    } finally {
      connection.release();
    }
  });
});

afterAll(async () => {
  if (database) await database.end();
});
