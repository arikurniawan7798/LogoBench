/** Placeholder for screens that are planned but not built yet (replaced in a later task). */
export default function ComingNext({ title, detail, level = 2 }: { title: string; detail?: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className="coming-next" aria-labelledby="coming-next-title">
      <p className="coming-next-tag">Coming next</p>
      <Heading id="coming-next-title">{title}</Heading>
      <p className="muted">{detail ?? "This part of LogoBench is still on the bench and arrives in a coming update."}</p>
    </section>
  );
}
