/** @jsxImportSource react */
import { Button } from "@react-email/components";
import { ReactNode } from "react";

interface PrimaryButtonProps {
  href: string;
  children: ReactNode;
}

/**
 * Liquid-friendly button. Background, text color, and border radius are
 * emitted as raw Liquid placeholders; `sendTemplatedEmail` is responsible
 * for resolving defaults before render. Inlining `| default: '...'` here
 * would not survive React Email's HTML escaping — single quotes become
 * `&#x27;`, which liquidjs cannot parse as a string literal.
 */
export function PrimaryButton({ href, children }: PrimaryButtonProps) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: "{{ branding.primary_color }}",
        color: "{{ branding.button_text_color }}",
        borderRadius: "{{ branding.button_border_radius }}",
        fontSize: "14px",
        fontWeight: 600,
        padding: "12px 28px",
        textDecoration: "none",
      }}
    >
      {children}
    </Button>
  );
}
