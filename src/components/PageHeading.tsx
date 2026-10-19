export function PageHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="mb-8"><p className="mb-3 text-xs font-bold tracking-[0.2em] text-indigo-600">{eyebrow}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1></div>
}
