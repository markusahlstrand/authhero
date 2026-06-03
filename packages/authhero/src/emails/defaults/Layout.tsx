/** @jsxImportSource react */
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { ReactNode } from "react";

interface LayoutProps {
  preview?: string;
  children: ReactNode;
}

/**
 * Shared frame for all built-in email defaults. Every visual token
 * (logo, colors, signature, address) is emitted as a raw Liquid placeholder
 * and resolved at send time from the tenant's branding + per-send vars.
 */
export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="en">
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Tailwind>
        <Body className="bg-zinc-100 font-sans m-0">
          <Container className="bg-white max-w-[560px] my-8 mx-auto rounded-md overflow-hidden">
            <Section className="px-6 pt-10 pb-8 text-center">
              {`{% if branding.logo %}`}
              <Img
                src={"{{ branding.logo }}"}
                alt={"{{ tenant.friendly_name }}"}
                width={140}
                className="mx-auto"
              />
              {`{% endif %}`}
            </Section>

            <Section className="px-6 text-zinc-800 text-[15px] leading-relaxed">
              {children}
            </Section>

            {`{% unless signature.enabled == false %}`}
            <Section className="px-6 pt-6 pb-2 text-zinc-800 text-[15px]">
              <Text className="m-0">{"{{ kind_regards }}"}</Text>
              <Text className="font-semibold mt-1 mb-0">
                {"{{ team_signature }}"}
              </Text>
            </Section>
            {`{% endunless %}`}

            <Section className="px-6 pt-4 pb-8">
              <Text className="text-xs text-zinc-500 italic m-0">
                {"{{ support_info }}"} {`{% if tenant.support_url %}`}
                <Link
                  href={"{{ tenant.support_url }}"}
                  style={{ color: "{{ branding.primary_color }}" }}
                  className="italic underline"
                >
                  {"{{ contact_us }}"}
                </Link>
                {`{% endif %}`}.
              </Text>
            </Section>
          </Container>

          {`{% if footer.address %}`}
          <Section className="max-w-[560px] mx-auto px-6 pb-2 text-center">
            <Text className="text-xs text-zinc-500 m-0 whitespace-pre-line">
              {"{{ footer.address }}"}
            </Text>
          </Section>
          {`{% endif %}`}

          <Section className="max-w-[560px] mx-auto px-6 pb-8 text-center">
            <Text className="text-xs text-zinc-400 m-0">
              {"{{ copyright }}"}
            </Text>
          </Section>
        </Body>
      </Tailwind>
    </Html>
  );
}
