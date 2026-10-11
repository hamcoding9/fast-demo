export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-8"><p className="mb-3 text-xs font-bold tracking-[0.2em] text-indigo-600">{eyebrow}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">{description}</p></div>
}
