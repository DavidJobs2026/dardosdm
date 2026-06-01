import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DardosDM — Gestión de torneos de dardos",
  description: "Crea y gestiona torneos de eliminación, doble eliminación y round robin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ef4444" />
      </head>
      <body className={inter.className}>
        <ServiceWorkerRegistration />
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: "#181818", color: "#f5f5f5", border: "1px solid #262626" },
          }}
        />
      </body>
    </html>
  );
}
