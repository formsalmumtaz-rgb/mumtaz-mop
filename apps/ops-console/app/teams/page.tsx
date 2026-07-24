export default function Page() {
  return <ComingSoon title="Teams" />;
}
function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-600">This screen is being built in K1b. Coming next.</p>
    </div>
  );
}
