"use client";
import { useState } from "react";
import { PenLine, ChevronDown, ChevronRight } from "lucide-react";
interface Props { notes: string[]; }
export default function GrammarNotesPanel({ notes }: Props) {
  const [open, setOpen] = useState(false);
  if (!notes||notes.length===0) return null;
  return (<div className="border border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50 dark:bg-amber-900/20 overflow-hidden"><button onClick={()=>setOpen(!open)} className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200"><PenLine className="w-4 h-4"/>Grammar Corrections<span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-xs">{notes.length}</span><span className="ml-auto">{open?<ChevronDown className="w-4 h-4"/>:<ChevronRight className="w-4 h-4"/>}</span></button><div className="transition-all duration-200 overflow-hidden" style={{maxHeight:open?`${notes.length*40+16}px`:"0px"}}><ul className="px-4 pb-3 space-y-1.5">{notes.map((n,i)=><li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><PenLine className="w-3.5 h-3.5 mt-0.5 shrink-0"/>{n}</li>)}</ul></div></div>);
}
