"use client";
import { ReactNode } from "react";
import { Check } from "lucide-react";
interface Props { steps: { title: string }[]; currentStep: number; children: ReactNode; }
export default function GeneratorWizard({ steps, currentStep, children }: Props) {
  return (<div><div className="flex items-center gap-2 mb-8">{steps.map((s, i) => (<div key={s.title} className="flex items-center gap-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${i < currentStep ? "bg-green-500 text-white" : i === currentStep ? "bg-blue-600 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500"}`}>{i < currentStep ? <Check className="w-4 h-4" /> : i + 1}</div><span className={`text-sm hidden sm:inline ${i === currentStep ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>{s.title}</span>{i < steps.length - 1 && <div className="w-8 h-px bg-zinc-300 dark:bg-zinc-600" />}</div>))}</div>{children}</div>);
}
