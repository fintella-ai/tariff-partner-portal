"use client";
import { Sparkles } from "lucide-react";
interface V { id: string; version: number; createdAt: string|Date; aiGenerated: boolean; }
interface Props { versions: V[]; currentId: string; onSelect: (id: string) => void; }
export default function VersionHistoryPanel({ versions, currentId, onSelect }: Props) {
  if (!versions||versions.length<=1) return null;
  const sorted = [...versions].sort((a,b)=>b.version-a.version);
  return (<div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 p-4"><h3 className="text-sm font-semibold mb-3">Version History</h3><div className="relative"><div className="absolute left-3 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-700"/><div className="space-y-3">{sorted.map(v=>(<button key={v.id} onClick={()=>onSelect(v.id)} className={`relative flex items-center gap-3 w-full pl-7 pr-3 py-2 rounded-lg text-left transition-colors ${v.id===currentId?"bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700":"hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}><div className={`absolute left-1.5 w-3 h-3 rounded-full border-2 ${v.id===currentId?"bg-blue-500 border-blue-500":"bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600"}`}/><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><span className="text-sm font-medium">v{v.version}</span>{v.aiGenerated&&<Sparkles className="w-3 h-3 text-amber-500"/>}{v.id===currentId&&<span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700">Current</span>}</div><span className="text-xs text-zinc-500">{new Date(v.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span></div></button>))}</div></div></div>);
}
