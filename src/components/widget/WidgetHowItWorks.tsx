export default function WidgetHowItWorks({ commissionRate }: { commissionRate: number }) {
  const steps = [
    {
      icon: "📋",
      title: "You refer a client",
      desc: "Fill in the referral form — takes 60 seconds. We take it from there.",
    },
    {
      icon: "⚖️",
      title: "Fintella handles everything",
      desc: "Legal filing, CAPE portal submission, IRS correspondence — the full recovery process.",
    },
    {
      icon: "💰",
      title: `You earn ${commissionRate}%`,
      desc: "Paid when your client receives their tariff refund. No risk, no upfront cost.",
    },
  ];

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="shrink-0 w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-xl">
              {step.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                  STEP {i + 1}
                </span>
                <h3 className="text-sm font-semibold text-gray-800">{step.title}</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4 text-center">
        <div className="text-3xl font-bold text-amber-600">$47,000</div>
        <div className="text-xs text-amber-700 mt-1">Average client refund</div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <h4 className="text-xs font-semibold text-gray-700">Who qualifies?</h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li className="flex gap-1.5"><span className="text-green-500">✓</span> U.S. importers of record</li>
          <li className="flex gap-1.5"><span className="text-green-500">✓</span> Paid tariffs under IEEPA, Section 232, or 301</li>
          <li className="flex gap-1.5"><span className="text-green-500">✓</span> Imported within the eligible recovery window</li>
          <li className="flex gap-1.5"><span className="text-green-500">✓</span> Documented entries with CBP</li>
        </ul>
      </div>
    </div>
  );
}
