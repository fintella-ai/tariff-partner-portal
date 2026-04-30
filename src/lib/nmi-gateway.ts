/**
 * NMI Payment Gateway Integration (via Paysafe)
 *
 * SETUP STEPS:
 * 1. Get NMI API credentials from Paysafe dashboard
 * 2. Set env vars: NMI_API_KEY (security key), NMI_TOKENIZATION_KEY (for Collect.js)
 * 3. Add Collect.js script to the payment page: <script src="https://secure.nmi.com/token/Collect.js" data-tokenization-key="..." />
 * 4. Collect.js tokenizes card → returns payment_token
 * 5. Server-side: POST token to NMI API to create customer vault + recurring subscription
 *
 * NMI API Docs: https://secure.nmi.com/merchants/resources/integration/integration_portal.php
 *
 * Flow:
 *   1. Partner clicks "Upgrade to Pro" → payment form loads Collect.js
 *   2. Collect.js tokenizes card client-side → returns payment_token
 *   3. Client POSTs token to /api/subscription/upgrade
 *   4. Server calls NMI: add_customer (vault) → add_subscription (recurring)
 *   5. On success: create Subscription record in DB
 *   6. Monthly: NMI auto-charges → webhook notifies → update status
 */

const NMI_API_KEY = process.env.NMI_API_KEY || "";
const NMI_API_URL = "https://secure.nmi.com/api/transact.php";

export function isNmiConfigured(): boolean {
  return !!NMI_API_KEY;
}

interface NmiResponse {
  response: string; // "1" = success, "2" = declined, "3" = error
  responsetext: string;
  transactionid?: string;
  customer_vault_id?: string;
}

async function nmiRequest(params: Record<string, string>): Promise<NmiResponse> {
  const body = new URLSearchParams({
    security_key: NMI_API_KEY,
    ...params,
  });

  const res = await fetch(NMI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  const parsed: Record<string, string> = {};
  for (const pair of text.split("&")) {
    const [k, v] = pair.split("=");
    if (k) parsed[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }

  return {
    response: parsed.response || "3",
    responsetext: parsed.responsetext || "Unknown error",
    transactionid: parsed.transactionid,
    customer_vault_id: parsed.customer_vault_id,
  };
}

export async function createCustomerVault(paymentToken: string, email: string, firstName: string, lastName: string): Promise<NmiResponse> {
  if (!NMI_API_KEY) {
    return { response: "1", responsetext: "Demo mode — NMI_API_KEY not set", customer_vault_id: `demo_${Date.now()}` };
  }

  return nmiRequest({
    customer_vault: "add_customer",
    payment_token: paymentToken,
    email,
    first_name: firstName,
    last_name: lastName,
  });
}

export async function chargeCustomerVault(customerVaultId: string, amount: number, orderId?: string): Promise<NmiResponse> {
  if (!NMI_API_KEY) {
    return { response: "1", responsetext: "Demo mode", transactionid: `demo_txn_${Date.now()}` };
  }

  return nmiRequest({
    customer_vault_id: customerVaultId,
    type: "sale",
    amount: (amount / 100).toFixed(2),
    order_id: orderId || `sub_${Date.now()}`,
  });
}

export async function addRecurringPlan(
  customerVaultId: string,
  planAmount: number,
  planName: string,
): Promise<NmiResponse> {
  if (!NMI_API_KEY) {
    return { response: "1", responsetext: "Demo mode — recurring plan created", transactionid: `demo_plan_${Date.now()}` };
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);

  return nmiRequest({
    recurring: "add_subscription",
    customer_vault_id: customerVaultId,
    plan_amount: (planAmount / 100).toFixed(2),
    plan_name: planName,
    plan_id: `fintella_${planName.toLowerCase()}`,
    start_date: startDate.toISOString().slice(0, 10).replace(/-/g, ""),
    day_frequency: "30",
  });
}

export async function cancelRecurringPlan(subscriptionId: string): Promise<NmiResponse> {
  if (!NMI_API_KEY) {
    return { response: "1", responsetext: "Demo mode — subscription canceled" };
  }

  return nmiRequest({
    recurring: "delete_subscription",
    subscription_id: subscriptionId,
  });
}
