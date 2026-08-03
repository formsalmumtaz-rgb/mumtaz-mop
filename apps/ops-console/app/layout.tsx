import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOP Admin Console",
  description: "Mumtaz Operations Platform — master data maintenance",
};

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/surveys", label: "Surveys" },
  { href: "/estimates", label: "Estimates" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/service-reports", label: "Service reports" },
  { href: "/invoices", label: "Invoices" },
  { href: "/receipts", label: "Receipts" },
  { href: "/credit-notes", label: "Credit notes" },
  { href: "/ar", label: "Receivables" },
  { href: "/cash-flow", label: "Cash flow" },
  { href: "/reports", label: "Reports" },
  { href: "/chemicals", label: "Chemicals" },
  { href: "/purchases", label: "Purchases" },
  { href: "/cost-config", label: "Cost setup" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/profitability", label: "Profitability" },
  { href: "/management", label: "Management" },
  { href: "/pricing", label: "Pricing models" },
  { href: "/jobs/new", label: "New job" },
  { href: "/technicians", label: "Technicians" },
  { href: "/teams", label: "Teams" },
  { href: "/recipes", label: "Treatment recipes" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="bg-brand text-white">
            <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-6">
              <Link href="/" className="font-semibold tracking-tight">
                MOP <span className="opacity-80 font-normal">Admin Console</span>
              </Link>
              <nav className="flex gap-4 text-sm">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className="opacity-90 hover:opacity-100">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
