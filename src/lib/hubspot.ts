const HS_PRIVATE_TOKEN = process.env.HUBSPOT_PRIVATE_TOKEN || "";
const HS_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || "";

export function getHubSpotPortalId(): string {
  return HS_PORTAL_ID;
}

export function getHubSpotDealUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/${HS_PORTAL_ID}/deal/${dealId}`;
}

export function getHubSpotContactUrl(contactId: string): string {
  return `https://app.hubspot.com/contacts/${HS_PORTAL_ID}/contact/${contactId}`;
}

async function hsSearch(
  objectType: string,
  filters: Array<{ propertyName: string; operator: string; value: string }>,
  properties: string[],
): Promise<any[]> {
  if (!HS_PRIVATE_TOKEN) return [];

  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${objectType}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HS_PRIVATE_TOKEN}`,
      },
      body: JSON.stringify({
        filterGroups: [{ filters }],
        properties,
        limit: 100,
      }),
      next: { revalidate: 60 },
    }
  );

  const data = await res.json();
  return data.results || [];
}

export async function fetchPartner(email: string, partnerCode: string) {
  const results = await hsSearch(
    "contacts",
    [
      { propertyName: "email", operator: "EQ", value: email },
      { propertyName: "partner_code", operator: "EQ", value: partnerCode },
    ],
    [
      "firstname", "lastname", "email", "partner_code",
      "referred_by_partner_code", "partner_status", "partner_signup_date",
      "l1_commission_total", "l2_commission_total", "downline_partner_count",
    ]
  );
  return results[0] || null;
}

export async function fetchDirectDeals(partnerCode: string) {
  return hsSearch(
    "deals",
    [{ propertyName: "submitting_partner_code", operator: "EQ", value: partnerCode }],
    [
      "dealname", "dealstage", "estimated_refund_amount", "firm_fee_amount",
      "l1_commission_amount", "l1_commission_status", "product_type",
      "ieepa_imported_products", "closedate", "createdate",
    ]
  );
}

export async function fetchDownlinePartners(partnerCode: string) {
  return hsSearch(
    "contacts",
    [{ propertyName: "referred_by_partner_code", operator: "EQ", value: partnerCode }],
    [
      "firstname", "lastname", "email", "partner_code",
      "partner_status", "partner_signup_date", "l1_commission_total",
    ]
  );
}

export async function fetchDownlineDeals(downlinePartnerCode: string) {
  return hsSearch(
    "deals",
    [{ propertyName: "submitting_partner_code", operator: "EQ", value: downlinePartnerCode }],
    [
      "dealname", "dealstage", "estimated_refund_amount", "firm_fee_amount",
      "l2_commission_amount", "l2_commission_status", "product_type", "createdate",
    ]
  );
}

// Demo data for development without HubSpot token
export function getDemoPartner(email: string, partnerCode: string) {
  return {
    id: "demo",
    properties: {
      firstname: "John",
      lastname: "Orlando",
      email,
      partner_code: partnerCode,
      partner_status: "Active",
      partner_signup_date: "2025-03-01",
      l1_commission_total: "8400",
      l2_commission_total: "1250",
      downline_partner_count: "3",
    },
  };
}

export function getDemoDirectDeals() {
  return [
    {
      id: "d1",
      properties: {
        dealname: "Acme Electronics Import LLC",
        dealstage: "engaged",
        estimated_refund_amount: "180000",
        firm_fee_amount: "36000",
        l1_commission_amount: "7200",
        l1_commission_status: "pending",
        product_type: "ieepa",
        ieepa_imported_products: "Consumer electronics",
        createdate: "2025-03-05",
      },
    },
    {
      id: "d2",
      properties: {
        dealname: "Pacific Textile Group",
        dealstage: "closedwon",
        estimated_refund_amount: "60000",
        firm_fee_amount: "12000",
        l1_commission_amount: "2400",
        l1_commission_status: "paid",
        product_type: "ieepa",
        ieepa_imported_products: "Textiles & apparel",
        createdate: "2025-02-18",
      },
    },
    {
      id: "d3",
      properties: {
        dealname: "Metro Steel Distributors",
        dealstage: "consultation_booked",
        estimated_refund_amount: "95000",
        firm_fee_amount: "19000",
        l1_commission_amount: "3800",
        l1_commission_status: "pending",
        product_type: "ieepa",
        ieepa_imported_products: "Steel & aluminum",
        createdate: "2025-03-10",
      },
    },
  ];
}

export function getDemoDownlinePartners() {
  return [
    {
      id: "p1",
      properties: {
        firstname: "Sarah",
        lastname: "Chen",
        email: "s.chen@cpagroup.com",
        partner_code: "PTNSC8K2F",
        partner_status: "Active",
        partner_signup_date: "2025-03-08",
      },
    },
    {
      id: "p2",
      properties: {
        firstname: "Mike",
        lastname: "Torres",
        email: "m.torres@advisors.com",
        partner_code: "PTNMT3X7Q",
        partner_status: "Active",
        partner_signup_date: "2025-03-12",
      },
    },
    {
      id: "p3",
      properties: {
        firstname: "Lisa",
        lastname: "Park",
        email: "l.park@tradelaw.com",
        partner_code: "PTNLP9W4R",
        partner_status: "Pending",
        partner_signup_date: "2025-03-15",
      },
    },
  ];
}

export function getDemoDownlineDeals() {
  return [
    {
      id: "dd1",
      properties: {
        dealname: "Global Auto Parts Inc.",
        dealstage: "qualified",
        estimated_refund_amount: "45000",
        firm_fee_amount: "9000",
        l2_commission_amount: "450",
        l2_commission_status: "pending",
        product_type: "ieepa",
        createdate: "2025-03-14",
        submitting_partner: "PTNSC8K2F",
        submitting_partner_name: "Sarah Chen",
      },
    },
    {
      id: "dd2",
      properties: {
        dealname: "Summit Furniture Co.",
        dealstage: "engaged",
        estimated_refund_amount: "128000",
        firm_fee_amount: "25600",
        l2_commission_amount: "1280",
        l2_commission_status: "pending",
        product_type: "ieepa",
        createdate: "2025-03-16",
        submitting_partner: "PTNMT3X7Q",
        submitting_partner_name: "Mike Torres",
      },
    },
  ];
}
