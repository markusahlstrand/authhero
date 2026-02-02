import type { FC } from "hono/jsx";
import sanitizeHtmlLib from "sanitize-html";
import Layout from "./Layout";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import type { FormNodeComponent } from "@authhero/adapter-interfaces";
import Button from "./Button";
import Icon from "./Icon";

/**
 * Sanitize HTML content to prevent XSS attacks.
 * While form content comes from trusted admin sources (management API),
 * this provides defense-in-depth against compromised admin accounts.
 *
 * Security considerations:
 * - No style attributes: Prevents CSS injection (background: url() tracking, UI redressing)
 * - Images restricted to data: URIs and https: Prevents tracking pixels from arbitrary domains
 * - Only safe formatting tags allowed
 */
function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'strong', 'b', 'em', 'i', 'u', 's', 'mark',
      'a', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'pre', 'code',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['class', 'id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    // Restrict image sources to https and data URIs (for inline images)
    // This prevents tracking pixels from arbitrary http domains
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src || '';
        // Only allow https:// URLs and data: URIs for images
        if (src && !src.startsWith('https://') && !src.startsWith('data:')) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName, attribs };
      },
      // Ensure links open safely
      a: (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  });
}

export type FormNodePageProps = {
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient;
  state: string;
  formName: string;
  nodeAlias?: string;
  error?: string;
  components?: FormNodeComponent[];
};

type RichTextComponentProps = Extract<FormNodeComponent, { type: "RICH_TEXT" }>;
const RichTextComponent = (comp: RichTextComponentProps) => {
  const sanitizedContent = sanitizeHtml(comp.config?.content ?? "");
  return (
    <div
      className="rich-text mb-6 prose prose-gray max-w-none [&>*:last-child]:mb-0 [&_h1]:mb-6 [&_h2]:mb-6"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      key={comp.id}
    />
  );
};

type LegalComponentProps = Extract<FormNodeComponent, { type: "LEGAL" }>;
const LegalComponent = (comp: LegalComponentProps) => {
  const sanitizedText = sanitizeHtml(comp.config?.text ?? "");
  return (
    <div key={comp.id} className="flex items-center gap-2">
      <input
        type="checkbox"
        name={comp.id}
        required={!!comp.required}
        className="w-5 h-5 accent-[#4F2D7F] align-middle"
        id={comp.id}
      />
      <span className="text-base leading-tight">
        <span dangerouslySetInnerHTML={{ __html: sanitizedText }} />
      </span>
    </div>
  );
};

type TextComponentProps = Extract<FormNodeComponent, { type: "TEXT" }>;
const TextComponent = (comp: TextComponentProps) => {
  return (
    <div key={comp.id} className="mb-4">
      <input
        type="text"
        name={comp.id}
        placeholder={comp.config?.placeholder || ""}
        required={!!comp.required}
        className="w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 border-gray-100 dark:border-gray-500"
        id={comp.id}
      />
    </div>
  );
};

function renderFormComponent(comp: FormNodeComponent) {
  switch (comp.type) {
    case "RICH_TEXT":
      return RichTextComponent(comp);
    case "LEGAL":
      return LegalComponent(comp);
    case "TEXT":
      return TextComponent(comp);
    default:
      return null;
  }
}

const FormNodePage: FC<FormNodePageProps> = ({
  theme,
  branding,
  client,
  formName,
  error,
  components,
}) => {
  // Find the first required legal checkbox id (if any)
  const requiredLegal = components?.find(
    (c) => c.type === "LEGAL" && c.required,
  ) as LegalComponentProps | undefined;
  const legalId = requiredLegal?.id;
  const nextButton = components?.find((c) => c.type === "NEXT_BUTTON");

  return (
    <Layout title={formName} theme={theme} branding={branding} client={client}>
      {error && <div className="mb-4 text-red-500">{error}</div>}
      <div className="flex flex-1 flex-col justify-center">
        <form className="pt-2" method="post">
          {/* Add CSS for toggling button visibility based on checkbox state */}
          {legalId && (
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  #_legalWrapper:has(#${legalId}:checked) #continueBtn {
                    display: block;
                  }
                  #_legalWrapper:has(#${legalId}:checked) #continueBtnDisabled {
                    display: none;
                  }
                  #_legalWrapper:not(:has(#${legalId}:checked)) #continueBtn {
                    display: none;
                  }
                  #_legalWrapper:not(:has(#${legalId}:checked)) #continueBtnDisabled {
                    display: block;
                  }
                `,
              }}
            />
          )}

          {/* Wrap everything in a container for the CSS selectors */}
          <div id="_legalWrapper">
            {/* Render components except NEXT_BUTTON */}
            {components &&
              components.map((comp) => {
                if (comp.type === "NEXT_BUTTON") return null;
                const node = renderFormComponent(comp);
                return node ? (
                  <div
                    key={comp.id}
                    className={comp.type === "RICH_TEXT" ? "mb-6" : "mb-4"}
                  >
                    {node}
                  </div>
                ) : null;
              })}

            {/* Render buttons */}
            {nextButton && (
              <div className="mb-4">
                {legalId ? (
                  <>
                    <Button
                      id="continueBtn"
                      className="sm:mt-4 !text-base w-full"
                    >
                      <span>{nextButton.config.text || "Continue"}</span>
                      <Icon className="text-xs" name="arrow-right" />
                    </Button>
                    <Button
                      id="continueBtnDisabled"
                      className="sm:mt-4 !text-base w-full opacity-50 cursor-not-allowed"
                      disabled
                    >
                      <span>{nextButton.config.text || "Continue"}</span>
                      <Icon className="text-xs" name="arrow-right" />
                    </Button>
                  </>
                ) : (
                  <Button className="sm:mt-4 !text-base w-full">
                    <span>{nextButton.config.text || "Continue"}</span>
                    <Icon className="text-xs" name="arrow-right" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default FormNodePage;
