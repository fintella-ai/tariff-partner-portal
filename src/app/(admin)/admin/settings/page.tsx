"use client";

import { useState } from "react";
import { FIRM_NAME, FIRM_SHORT, FIRM_PHONE, DEFAULT_FIRM_FEE_RATE, DEFAULT_L1_RATE, DEFAULT_L2_RATE, DEFAULT_L3_RATE } from "@/lib/constants";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputClass = "w-full bg-white/5 border border-white/[0.12] rounded-lg px-4 py-3 text-white font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-white/30";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-white/50 mb-2 block";

  return (
    <div>
      <h2 className="font-display text-[22px] font-bold mb-1.5">Settings</h2>
      <p className="font-body text-[13px] text-white/40 mb-6">Configure portal branding, integrations, and system settings.</p>

      {saved && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg font-body text-[13px] text-green-400">
          Settings saved successfully.
        </div>
      )}

      {/* Branding */}
      <div className="card p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Branding</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Firm Name</label>
            <input className={inputClass} defaultValue={FIRM_NAME} />
          </div>
          <div>
            <label className={labelClass}>Short Name</label>
            <input className={inputClass} defaultValue={FIRM_SHORT} />
          </div>
          <div>
            <label className={labelClass}>Support Phone</label>
            <input className={inputClass} defaultValue={FIRM_PHONE} />
          </div>
          <div>
            <label className={labelClass}>Support Email</label>
            <input className={inputClass} defaultValue="support@trrln.com" placeholder="support@trrln.com" />
          </div>
        </div>
      </div>

      {/* Commission Defaults */}
      <div className="card p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Default Commission Rates</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Firm Fee Rate</label>
            <input className={inputClass} defaultValue={`${(DEFAULT_FIRM_FEE_RATE * 100).toFixed(0)}%`} />
          </div>
          <div>
            <label className={labelClass}>L1 Rate (Direct)</label>
            <input className={inputClass} defaultValue={`${(DEFAULT_L1_RATE * 100).toFixed(0)}%`} />
          </div>
          <div>
            <label className={labelClass}>L2 Rate (Downline)</label>
            <input className={inputClass} defaultValue={`${(DEFAULT_L2_RATE * 100).toFixed(0)}%`} />
          </div>
          <div>
            <label className={labelClass}>L3 Rate (2nd Downline)</label>
            <input className={inputClass} defaultValue={`${(DEFAULT_L3_RATE * 100).toFixed(0)}%`} />
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="card p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Integrations</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 border border-white/[0.06] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="font-body text-sm font-medium text-white">HubSpot CRM</div>
              <span className="font-body text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5">Connected</span>
            </div>
            <div className="font-body text-[12px] text-white/40">Portal ID: ****</div>
          </div>
          <div className="p-4 border border-white/[0.06] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="font-body text-sm font-medium text-white">SignWell E-Signature</div>
              <span className="font-body text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2.5 py-0.5">Not Configured</span>
            </div>
            <div className="font-body text-[12px] text-white/40">API key required</div>
          </div>
          <div className="p-4 border border-white/[0.06] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="font-body text-sm font-medium text-white">Payout Provider</div>
              <span className="font-body text-[10px] bg-white/5 text-white/40 border border-white/10 rounded-full px-2.5 py-0.5">CSV Export</span>
            </div>
            <div className="font-body text-[12px] text-white/40">Stripe/Wise integration available</div>
          </div>
          <div className="p-4 border border-white/[0.06] rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="font-body text-sm font-medium text-white">Conference (Zoom/Jitsi)</div>
              <span className="font-body text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2.5 py-0.5">Not Configured</span>
            </div>
            <div className="font-body text-[12px] text-white/40">Embed URL required</div>
          </div>
        </div>
      </div>

      {/* Admin Users */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-body font-semibold text-sm">Admin Users</div>
          <button className="font-body text-[11px] tracking-[1px] uppercase text-brand-gold/70 border border-brand-gold/20 rounded px-3 py-1.5 hover:bg-brand-gold/10 transition-colors">
            + Add Admin
          </button>
        </div>
        <div className="p-4 border border-white/[0.06] rounded-lg flex items-center justify-between">
          <div>
            <div className="font-body text-sm text-white">Admin User</div>
            <div className="font-body text-[11px] text-white/30">admin@trrln.com · Super Admin</div>
          </div>
          <span className="font-body text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5">Active</span>
        </div>
      </div>

      <button onClick={handleSave} className="btn-gold text-[12px] px-8 py-3">
        Save Settings
      </button>
    </div>
  );
}
