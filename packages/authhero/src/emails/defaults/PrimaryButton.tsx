/** @jsxImportSource react */
import { Button } from "@react-email/components";
import { ReactNode } from "react";

interface PrimaryButtonProps {
  href: string;
  children: ReactNode;
}

/**
 * Liquid-friendly button. Color, text color, and border radius are emitted
 * as Liquid placeholders with sensible defaults so tenants can re-skin via
 * branding tokens without editing the template body.
 */
export function PrimaryButton({ href, children }: PrimaryButtonProps) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: "{{ branding.primary_color }}",
        color: "{{ branding.button_text_color | default: '#ffffff' }}",
        borderRadius: "{{ branding.button_border_radius | default: '4px' }}",
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
