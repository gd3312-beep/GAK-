import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PageShellProps = {
  title: string;
  subtitle?: string;
  backPath?: string;
  right?: ReactNode;
  children: ReactNode;
};

export function PageShell({ title, subtitle, backPath = "/home", right, children }: PageShellProps) {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-gradient-radial noise-overlay pb-24">
      <div className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full bg-gak/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-0 h-64 w-64 rounded-full bg-gyaan/10 blur-3xl" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/65 border-b border-border/50">
        <div className="px-4 py-4 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(backPath)}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {right}
        </div>
        <div className="px-4 pb-4">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </header>

      <main className="relative z-10 px-4 py-4 space-y-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {children}
        </motion.div>
      </main>
    </div>
  );
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-card p-4 space-y-3 border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
