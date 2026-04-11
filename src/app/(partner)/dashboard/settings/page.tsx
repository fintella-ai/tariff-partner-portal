"use client";

import { useState, useEffect } from "react";
import { useDevice } from "@/lib/useDevice";
import { useRouter } from "next/navigation";
import CountryCodeSelect, { parseMobilePhone, buildMobilePhone } from "@/components/ui/CountryCodeSelect";

interface SettingsData {
  firstName: string;
  lastName: string;
  companyName: string;
  tin: string;
  email: string;
  phone: string;
  mobilePhone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY: SettingsData = {
  firstName: "", lastName: "", companyName: "", tin: "",
  email: "", phone: "", mobilePhone: "",
  street: "", street2: "", city: "", state: "", zip: "",
};

function formatTIN(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export default function AccountSettingsPage() {
  const device = useDevice();
  const router = useRouter();
  const [form, setForm] = useState<SettingsData>(EMPTY);
  const [original, setOriginal] = useState<SettingsData>(EMPTY);
  const [mobileCountry, setMobileCountry] = useState("US");
  const [mobileNumber, setMobileNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "warning" | "error" } | null>(null);

  useEffect(() => {
    fetch("/api/partner/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SettingsData) => {
        setForm(data);
        setOriginal(data);
        const parsed = parseMobilePhone(data.mobilePhone);
        setMobileCountry(parsed.countryCode);
        setMobileNumber(parsed.phoneNumber);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name === "tin") {
      setForm((prev) => ({ ...prev, tin: formatTIN(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    if (message) setMessage(null);
  }

  const nameChanged =
    form.firstName !== original.firstName ||
    form.lastName !== original.lastName ||
    form.companyName !== original.companyName;

  const builtMobile = buildMobilePhone(mobileCountry, mobileNumber);
  const hasChanges = JSON.stringify(form) !== JSON.stringify(original) || builtMobile !== original.mobilePhone;

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        ...form,
        mobilePhone: buildMobilePhone(mobileCountry, mobileNumber),
      };
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.error || "Failed to save", type: "error" });
        return;
      }

      setOriginal({ ...form });

      if (data.agreementReset) {
        setMessage({
          text: "Settings saved. Your name or company changed — a new partnership agreement is required.",
          type: "warning",
        });
      } else {
        setMessage({ text: "Settings saved successfully.", type: "success" });
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-3 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";

  const labelClass =
    "font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-2 block";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Account Settings
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-5">
        Manage your personal information and contact details.
      </p>

      {/* Warning banner when name fields are modified */}
      {nameChanged && (
        <div className="mb-5 p-3.5 bg-yellow-500/[0.08] border border-yellow-500/25 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="font-body text-[12px] text-yellow-300/80 leading-relaxed">
            Changing your name or company name will require a new partnership agreement to be signed.
          </div>
        </div>
      )}

      <div className={`card ${device.cardPadding} ${device.borderRadius}`}>

        {/* ── Personal Information ── */}
        <div className="mb-6">
          <div className="font-body text-[12px] font-semibold text-[var(--app-text-secondary)] tracking-wider uppercase mb-4">
            Personal Information
          </div>

          <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-4`}>
            <div>
              <label htmlFor="firstName" className={labelClass}>
                First Name
              </label>
              <input
                id="firstName" name="firstName" type="text"
                value={form.firstName} onChange={handleChange}
                className={inputClass} placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>
                Last Name
              </label>
              <input
                id="lastName" name="lastName" type="text"
                value={form.lastName} onChange={handleChange}
                className={inputClass} placeholder="Last name"
              />
            </div>
          </div>

          <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4`}>
            <div>
              <label htmlFor="companyName" className={labelClass}>
                Company Name <span className="text-[var(--app-text-muted)] normal-case">(if applicable)</span>
              </label>
              <input
                id="companyName" name="companyName" type="text"
                value={form.companyName} onChange={handleChange}
                className={inputClass} placeholder="Company name"
              />
            </div>
            <div>
              <label htmlFor="tin" className={labelClass}>
                TIN
              </label>
              <input
                id="tin" name="tin" type="text"
                value={form.tin} onChange={handleChange}
                className={inputClass} placeholder="##-#######"
                maxLength={10}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--app-border)] my-6" />

        {/* ── Contact Information ── */}
        <div className="mb-6">
          <div className="font-body text-[12px] font-semibold text-[var(--app-text-secondary)] tracking-wider uppercase mb-4">
            Contact Information
          </div>

          <div className="mb-4">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email" name="email" type="email"
              value={form.email} onChange={handleChange}
              className={inputClass} placeholder="email@example.com"
            />
          </div>

          <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4`}>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone Number
              </label>
              <input
                id="phone" name="phone" type="tel"
                value={form.phone} onChange={handleChange}
                className={inputClass} placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label htmlFor="mobileNumber" className={labelClass}>
                Mobile Phone <span className="text-[var(--app-text-muted)] normal-case">(SMS)</span>
              </label>
              <div className="flex gap-2">
                <CountryCodeSelect
                  selectedCode={mobileCountry}
                  onChange={(code) => { setMobileCountry(code); if (message) setMessage(null); }}
                />
                <input
                  id="mobileNumber" type="tel"
                  value={mobileNumber}
                  onChange={(e) => { setMobileNumber(e.target.value); if (message) setMessage(null); }}
                  className={`${inputClass} flex-1`} placeholder="555-123-4567"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--app-border)] my-6" />

        {/* ── Address ── */}
        <div className="mb-6">
          <div className="font-body text-[12px] font-semibold text-[var(--app-text-secondary)] tracking-wider uppercase mb-4">
            Street Address
          </div>

          <div className="mb-4">
            <label htmlFor="street" className={labelClass}>
              Address Line 1
            </label>
            <input
              id="street" name="street" type="text"
              value={form.street} onChange={handleChange}
              className={inputClass} placeholder="123 Main St"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="street2" className={labelClass}>
              Address Line 2
            </label>
            <input
              id="street2" name="street2" type="text"
              value={form.street2} onChange={handleChange}
              className={inputClass} placeholder="Suite 100"
            />
          </div>

          <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-3"} gap-4`}>
            <div>
              <label htmlFor="city" className={labelClass}>
                City
              </label>
              <input
                id="city" name="city" type="text"
                value={form.city} onChange={handleChange}
                className={inputClass} placeholder="City"
              />
            </div>
            <div>
              <label htmlFor="state" className={labelClass}>
                State
              </label>
              <input
                id="state" name="state" type="text"
                value={form.state} onChange={handleChange}
                className={inputClass} placeholder="State"
              />
            </div>
            <div>
              <label htmlFor="zip" className={labelClass}>
                Zip Code
              </label>
              <input
                id="zip" name="zip" type="text"
                value={form.zip} onChange={handleChange}
                className={inputClass} placeholder="12345"
              />
            </div>
          </div>
        </div>

        {/* ── Message banner ── */}
        {message && (
          <div className={`mb-5 p-3.5 rounded-lg border text-[13px] font-body ${
            message.type === "success"
              ? "bg-green-500/10 border-green-500/25 text-green-400"
              : message.type === "warning"
                ? "bg-yellow-500/10 border-yellow-500/25 text-yellow-400"
                : "bg-red-500/10 border-red-500/25 text-red-400"
          }`}>
            {message.text}
            {message.type === "warning" && (
              <button
                onClick={() => router.push("/dashboard/documents")}
                className="ml-2 underline hover:no-underline"
              >
                Go to Documents
              </button>
            )}
          </div>
        )}

        {/* ── Save button ── */}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`btn-gold w-full flex items-center justify-center gap-2 min-h-[48px] ${
            !hasChanges ? "opacity-40 cursor-not-allowed" : ""
          }`}
        >
          {saving && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
