"use client";
interface Props { variableKey: string; label?: string; isActive?: boolean; onClick?: () => void; }
export default function VariableChip({ variableKey, label, isActive, onClick }: Props) {
  return (<button onClick={onClick} title={label||variableKey} className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${isActive ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}>{`{{${variableKey}}}`}</button>);
}
