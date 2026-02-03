import { Edit, TextInput, TabbedForm } from "react-admin";
import { ColorInput } from "react-admin-color-picker";
import { useInput, useRecordContext } from "react-admin";
import { useState, useEffect } from "react";
import { Box } from "@mui/material";
import { ThemesTab } from "./ThemesTab";
import { BrandingPreview } from "./BrandingPreview";
import { UniversalLoginTab } from "./UniversalLoginTab";

// Helper to recursively remove null values and empty objects from data
// This is needed because react-admin sends null for empty form fields,
// but the server schema expects fields to be omitted rather than null
function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip null and undefined values
    if (value === null || value === undefined) {
      continue;
    }

    // Recursively clean nested objects (but not arrays)
    if (typeof value === "object" && !Array.isArray(value)) {
      const cleaned = cleanObject(value as Record<string, unknown>);
      // Only include non-empty objects
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// Transform function to clean up empty objects and null values before sending to server
// The server schema has strict requirements:
// - font.url is required if font object is present
// - page_background must be an object or omitted, not null
// - Many fields cannot be null, only omitted
const transformBranding = (data: Record<string, unknown>) => {
  // First, recursively clean all null values and empty objects
  const result = cleanObject(data);

  // Remove font object if url is not set (font.url is required if font exists)
  if (
    result.font &&
    typeof result.font === "object" &&
    !(result.font as Record<string, unknown>).url
  ) {
    delete result.font;
  }

  return result;
};

function PageBackgroundInput(props) {
  const { field } = useInput(props);
  const record = useRecordContext();
  const value = field.value ?? record?.colors?.page_background;
  const [mode, setMode] = useState(
    typeof value === "string" || !value ? "color" : "gradient",
  );
  const [color, setColor] = useState(typeof value === "string" ? value : "");
  const [gradient, setGradient] = useState(
    typeof value === "object" && value
      ? {
          type: value.type || "linear-gradient",
          start: value.start || "",
          end: value.end || "",
          angle_deg: value.angle_deg || 0,
        }
      : { type: "linear-gradient", start: "", end: "", angle_deg: 0 },
  );

  useEffect(() => {
    if (mode === "color") {
      field.onChange(color);
    } else {
      field.onChange(gradient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, color, gradient]);

  // ColorInput is uncontrolled, so we use a key to force remount on value change
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontWeight: 500 }}>Page Background</label>
      <div style={{ margin: "8px 0" }}>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ marginBottom: 8 }}
        >
          <option value="color">Solid Color</option>
          <option value="gradient">Gradient</option>
        </select>
      </div>
      {mode === "color" ? (
        <>
          <ColorInput
            key="page-background-solid"
            source={props.source}
            label="Solid Color"
            // No value prop, uncontrolled
          />
          <TextInput
            source="_page_background_color_helper"
            style={{ display: "none" }}
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <TextInput
            source="colors.page_background.type"
            label="Type"
            value={gradient.type}
            onChange={(e) =>
              setGradient((g) => ({ ...g, type: e.target.value }))
            }
          />
          <ColorInput
            key="page-background-start"
            source="colors.page_background.start"
            label="Start Color"
          />
          <TextInput
            source="_page_background_start_helper"
            style={{ display: "none" }}
            value={gradient.start}
            onChange={(e) =>
              setGradient((g) => ({ ...g, start: e.target.value }))
            }
          />
          <ColorInput
            key="page-background-end"
            source="colors.page_background.end"
            label="End Color"
          />
          <TextInput
            source="_page_background_end_helper"
            style={{ display: "none" }}
            value={gradient.end}
            onChange={(e) =>
              setGradient((g) => ({ ...g, end: e.target.value }))
            }
          />
          <TextInput
            source="colors.page_background.angle_deg"
            label="Angle (deg)"
            type="number"
            value={gradient.angle_deg}
            onChange={(e) =>
              setGradient((g) => ({ ...g, angle_deg: Number(e.target.value) }))
            }
          />
        </div>
      )}
    </div>
  );
}

// Wrapper component that provides the preview inside the form context
function BrandingFormContent() {
  return (
    <Box sx={{ display: "flex", gap: 3, p: 0 }}>
      {/* Form Section */}
      <Box sx={{ flex: "1 1 60%", minWidth: 0 }}>
        <TabbedForm>
          <TabbedForm.Tab label="Style">
            <ColorInput source="colors.primary" label="Primary Color" />
            <PageBackgroundInput source="colors.page_background" />
            <TextInput source="favicon_url" label="Favicon URL" />
            <TextInput source="logo_url" label="Logo URL" />
            <TextInput source="font.url" label="Font URL" />
            {/* Preview inside the form context */}
            <Box
              sx={{
                position: "fixed",
                right: 24,
                top: 80,
                width: 400,
                height: "calc(100vh - 120px)",
                display: { xs: "none", lg: "block" },
                zIndex: 1000,
              }}
            >
              <BrandingPreview />
            </Box>
          </TabbedForm.Tab>
          <TabbedForm.Tab label="Themes">
            <ThemesTab />
            {/* Preview inside the form context */}
            <Box
              sx={{
                position: "fixed",
                right: 24,
                top: 80,
                width: 400,
                height: "calc(100vh - 120px)",
                display: { xs: "none", lg: "block" },
                zIndex: 1000,
              }}
            >
              <BrandingPreview />
            </Box>
          </TabbedForm.Tab>
          <TabbedForm.Tab label="Universal Login">
            <UniversalLoginTab />
          </TabbedForm.Tab>
        </TabbedForm>
      </Box>
    </Box>
  );
}

export function BrandingEdit() {
  return (
    <Edit transform={transformBranding}>
      <BrandingFormContent />
    </Edit>
  );
}
