// Page-to-page entrance: content fades in on navigation (the layout/header stays
// put). Respects prefers-reduced-motion via the global reduce rule.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
