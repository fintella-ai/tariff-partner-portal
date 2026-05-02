"use client";
interface Props { text: string; maxChars?: number; }
export default function SmsCharacterCounter({ text, maxChars = 160 }: Props) {
  const c = text.length, s = c <= 160 ? 1 : Math.ceil(c/153), p = Math.min((c/maxChars)*100,100);
  const cl = c>maxChars?"text-red-600 dark:text-red-400":c>maxChars*0.75?"text-amber-600 dark:text-amber-400":"text-green-600 dark:text-green-400";
  const b = c>maxChars?"bg-red-500":c>maxChars*0.75?"bg-amber-500":"bg-green-500";
  return (<div className="space-y-1.5"><div className="flex items-center justify-between text-sm"><span className={`font-mono font-medium ${cl}`}>{c} / {maxChars}</span><span className="text-xs text-zinc-500">{s} segment{s!==1?"s":""}</span></div><div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden"><div className={`h-full ${b} transition-all duration-200 rounded-full`} style={{width:`${Math.min(p,100)}%`}}/></div>{c>maxChars&&<p className="text-xs text-red-600 dark:text-red-400">Over by {c-maxChars} chars — {s} segments</p>}</div>);
}
