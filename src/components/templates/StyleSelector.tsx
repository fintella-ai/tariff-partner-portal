"use client";
import { Check } from "lucide-react";
interface Style { id: string; name: string; description: string; }
interface Props { styles: Style[]; selectedId: string; onChange: (id: string) => void; }
const EX: Record<string,string> = { Professional: "Dear Partner, We are writing to inform you of an important update.", Conversational: "Hey there! Quick heads up about something exciting.", "Urgent/Action-Required": "ACTION REQUIRED: Your immediate attention is needed.", Empathetic: "We understand this may be challenging, and we're here to help.", "Sales-Forward": "You won't want to miss this opportunity to grow your revenue!" };
export default function StyleSelector({ styles, selectedId, onChange }: Props) {
  return (<div className="grid grid-cols-1 md:grid-cols-2 gap-3">{styles.map((s) => (<button key={s.id} onClick={() => onChange(s.id)} className={`text-left p-4 rounded-xl border-2 transition-colors ${selectedId === s.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}><div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</span>{selectedId === s.id && <Check className="w-4 h-4 text-blue-500" />}</div><p className="text-xs text-zinc-500 mb-2">{s.description}</p><p className="text-xs italic text-zinc-400">&ldquo;{EX[s.name]||s.description}&rdquo;</p></button>))}</div>);
}
