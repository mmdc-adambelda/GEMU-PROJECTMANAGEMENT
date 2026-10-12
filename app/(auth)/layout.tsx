import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { brand } from "@/lib/brand";

const points = [
  "Spaces, projects and tasks with real-time collaboration",
  "Kanban, list, calendar and timeline views on live data",
  "Configurable workflows, custom fields and automations",
  "Row-level security keeps every organization's data isolated",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Logo className="[&_span:last-child]:text-primary-foreground" />
        <div className="space-y-6">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">{brand.tagline}.</h2>
          <ul className="space-y-3 text-sm text-primary-foreground/90">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/70">© {new Date().getFullYear()} {brand.name}</p>
      </div>
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <Logo className="lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
