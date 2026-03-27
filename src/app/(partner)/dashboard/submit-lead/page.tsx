"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";

const PRODUCT_TYPES = [
  "Consumer Electronics",
  "Textiles & Apparel",
  "Steel & Aluminum",
  "Auto Parts",
  "Furniture",
  "Agricultural Products",
  "Other",
] as const;

interface FormData {
  businessName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  estimatedAnnualImportValue: string;
  productType: string;
  notes: string;
}

interface FormErrors {
  businessName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  email?: string;
}

const initialFormData: FormData = {
  businessName: "",
  contactFirstName: "",
  contactLastName: "",
  email: "",
  phone: "",
  estimatedAnnualImportValue: "",
  productType: "",
  notes: "",
};

export default function SubmitLeadPage() {
  const device = useDevice();
  const { data: session } = useSession();
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [agreementSigned, setAgreementSigned] = useState<boolean | null>(null);

  // ── Fetch agreement status ────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/agreement")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setAgreementSigned(data.agreement?.status === "signed");
      })
      .catch(() => {
        // If API fails, default to allowing access (demo mode)
        setAgreementSigned(true);
      });
  }, []);

  if (agreementSigned === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Checking agreement status...</div>
      </div>
    );
  }

  if (!agreementSigned) {
    return (
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
          Submit a Lead
        </h2>
        <p className="font-body text-sm text-white/40 mb-6">
          Submit a new client referral to {FIRM_SHORT}.
        </p>

        <div
          className={`card ${device.cardPadding} ${device.borderRadius} border border-yellow-500/25`}
        >
          <div className="text-center py-6">
            {/* Lock icon */}
            <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>

            <h3 className="font-display text-lg sm:text-xl font-bold mb-2">
              Partnership Agreement Required
            </h3>
            <p className="font-body text-sm text-white/50 mb-6 max-w-md mx-auto leading-relaxed">
              You must sign your partnership agreement before submitting deals.
              Please visit the Documents tab to complete your agreement.
            </p>

            <button
              type="button"
              onClick={() => router.push("/dashboard/documents")}
              className="btn-gold w-full max-w-xs mx-auto"
            >
              Go to Documents &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!form.businessName.trim()) {
      newErrors.businessName = "Business name is required.";
    }
    if (!form.contactFirstName.trim()) {
      newErrors.contactFirstName = "First name is required.";
    }
    if (!form.contactLastName.trim()) {
      newErrors.contactLastName = "Last name is required.";
    }
    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = "Please enter a valid email address.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      // TODO: replace with actual API call once /api/hubspot/leads exists
      console.log("[SubmitLead] POST /api/hubspot/leads", {
        ...form,
        estimatedAnnualImportValue: form.estimatedAnnualImportValue
          ? Number(form.estimatedAnnualImportValue)
          : null,
        submittedBy: session?.user?.email ?? "unknown",
      });

      // Simulate network delay
      await new Promise((r) => setTimeout(r, 1200));

      setSubmitted(true);
    } catch (err) {
      console.error("[SubmitLead] Error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setForm(initialFormData);
    setErrors({});
    setSubmitted(false);
  }

  const inputClass =
    "w-full bg-white/5 border border-white/[0.12] rounded-lg px-4 py-3 text-white font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-white/30";

  const labelClass =
    "font-body text-[11px] tracking-[1px] uppercase text-white/50 mb-2 block";

  const errorClass = "font-body text-[12px] text-red-400 mt-1.5";

  // ── Success confirmation ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
          Submit a Lead
        </h2>
        <p className="font-body text-sm text-white/40 mb-6">
          Submit a new client referral to {FIRM_SHORT}.
        </p>

        <div
          className={`card ${device.cardPadding} ${device.borderRadius} text-center`}
        >
          {/* Checkmark */}
          <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h3 className="font-display text-lg sm:text-xl font-bold mb-2">
            Lead Submitted Successfully
          </h3>
          <p className="font-body text-sm text-white/50 mb-6 max-w-md mx-auto leading-relaxed">
            Your referral for <span className="text-white">{form.businessName}</span> has
            been received. You can track its progress in your{" "}
            <span className="text-brand-gold">My Deals</span> tab.
          </p>

          <button
            type="button"
            onClick={handleReset}
            className="btn-gold w-full max-w-xs mx-auto"
          >
            Submit Another Lead
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        Submit a Lead
      </h2>
      <p className="font-body text-sm text-white/40 mb-6">
        Submit a new client referral to {FIRM_SHORT}.
      </p>

      <div className={`card ${device.cardPadding} ${device.borderRadius}`}>
        {/* Instructional note */}
        <div className="mb-6 p-3.5 bg-brand-gold/[0.06] border border-brand-gold/20 rounded-lg">
          <p className="font-body text-[13px] text-white/60 leading-relaxed">
            Submit a new client referral. Once submitted, it will be tracked in
            your <span className="text-brand-gold font-medium">My Deals</span>{" "}
            tab.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Business Name — full width */}
          <div className="mb-5">
            <label htmlFor="businessName" className={labelClass}>
              Business Name <span className="text-red-400">*</span>
            </label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              placeholder="Acme Imports LLC"
              value={form.businessName}
              onChange={handleChange}
              className={inputClass}
            />
            {errors.businessName && (
              <p className={errorClass}>{errors.businessName}</p>
            )}
          </div>

          {/* Contact Name — 2-col on desktop, 1-col on mobile */}
          <div
            className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-5`}
          >
            <div>
              <label htmlFor="contactFirstName" className={labelClass}>
                Contact First Name <span className="text-red-400">*</span>
              </label>
              <input
                id="contactFirstName"
                name="contactFirstName"
                type="text"
                placeholder="Jane"
                value={form.contactFirstName}
                onChange={handleChange}
                className={inputClass}
              />
              {errors.contactFirstName && (
                <p className={errorClass}>{errors.contactFirstName}</p>
              )}
            </div>
            <div>
              <label htmlFor="contactLastName" className={labelClass}>
                Contact Last Name <span className="text-red-400">*</span>
              </label>
              <input
                id="contactLastName"
                name="contactLastName"
                type="text"
                placeholder="Smith"
                value={form.contactLastName}
                onChange={handleChange}
                className={inputClass}
              />
              {errors.contactLastName && (
                <p className={errorClass}>{errors.contactLastName}</p>
              )}
            </div>
          </div>

          {/* Email & Phone — 2-col on desktop, 1-col on mobile */}
          <div
            className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-5`}
          >
            <div>
              <label htmlFor="email" className={labelClass}>
                Email <span className="text-red-400">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="jane@acmeimports.com"
                value={form.email}
                onChange={handleChange}
                className={inputClass}
              />
              {errors.email && <p className={errorClass}>{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={form.phone}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          {/* Estimated Annual Import Value — full width */}
          <div className="mb-5">
            <label htmlFor="estimatedAnnualImportValue" className={labelClass}>
              Estimated Annual Import Value
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-body text-sm">
                $
              </span>
              <input
                id="estimatedAnnualImportValue"
                name="estimatedAnnualImportValue"
                type="number"
                min="0"
                placeholder="500000"
                value={form.estimatedAnnualImportValue}
                onChange={handleChange}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          {/* Product Types — full width */}
          <div className="mb-5">
            <label htmlFor="productType" className={labelClass}>
              Product Types
            </label>
            <select
              id="productType"
              name="productType"
              value={form.productType}
              onChange={handleChange}
              className={`${inputClass} appearance-none cursor-pointer`}
            >
              <option value="" className="bg-[#0d1322] text-white/50">
                Select a product type...
              </option>
              {PRODUCT_TYPES.map((type) => (
                <option key={type} value={type} className="bg-[#0d1322] text-white">
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Notes — full width */}
          <div className="mb-7">
            <label htmlFor="notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              placeholder="Any additional context about this lead..."
              value={form.notes}
              onChange={handleChange}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full flex items-center justify-center gap-2 min-h-[48px]"
          >
            {loading && (
              <svg
                className="animate-spin h-4 w-4 text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {loading ? "Submitting..." : "Submit Lead"}
          </button>
        </form>
      </div>
    </div>
  );
}
