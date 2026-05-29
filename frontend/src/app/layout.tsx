import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Label Forge - Computer Vision Platform",
  description: "Professional Computer Vision Data Annotation and Management Platform",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

const hydrationAttributeCleanup = `
(() => {
  const shouldRemove = (name) =>
    name === 'bis_skin_checked' ||
    name === 'bis_register' ||
    name.startsWith('__processed_');

  const clean = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of Array.from(node.attributes)) {
      if (shouldRemove(attr.name)) node.removeAttribute(attr.name);
    }
  };

  const cleanTree = (root) => {
    clean(root);
    if (root.querySelectorAll) {
      root.querySelectorAll('*').forEach(clean);
    }
  };

  cleanTree(document.documentElement);

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        clean(mutation.target);
      } else {
        mutation.addedNodes.forEach(cleanTree);
      }
    }
  }).observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <Script
          id="hydration-attribute-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: hydrationAttributeCleanup }}
        />
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const savedTheme = localStorage.getItem('theme');
                  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  const theme = savedTheme || systemTheme;
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {
                  console.error('Failed to set initial theme:', e);
                }
              })();
            `
          }}
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
