import {
  TextInput,
  NumberInput,
  BooleanInput,
  SelectInput,
} from "@/components/admin";
import { ColorInput } from "./color-input";

const keepEmptyString = (v: string | null | undefined) => v ?? "";

const colorFields: { source: string; label: string }[] = [
  { source: "themes.colors.primary_button", label: "Primary Button" },
  {
    source: "themes.colors.primary_button_label",
    label: "Primary Button Label",
  },
  {
    source: "themes.colors.secondary_button_border",
    label: "Secondary Button Border",
  },
  {
    source: "themes.colors.secondary_button_label",
    label: "Secondary Button Label",
  },
  { source: "themes.colors.base_focus_color", label: "Base Focus Color" },
  { source: "themes.colors.base_hover_color", label: "Base Hover Color" },
  { source: "themes.colors.body_text", label: "Body Text" },
  { source: "themes.colors.error", label: "Error" },
  { source: "themes.colors.header", label: "Header" },
  { source: "themes.colors.icons", label: "Icons" },
  { source: "themes.colors.input_background", label: "Input Background" },
  { source: "themes.colors.input_border", label: "Input Border" },
  { source: "themes.colors.input_filled_text", label: "Input Filled Text" },
  {
    source: "themes.colors.input_labels_placeholders",
    label: "Input Labels/Placeholders",
  },
  {
    source: "themes.colors.links_focused_components",
    label: "Links/Focused Components",
  },
  { source: "themes.colors.success", label: "Success" },
  { source: "themes.colors.widget_background", label: "Widget Background" },
  { source: "themes.colors.widget_border", label: "Widget Border" },
];

const fontSections: { key: string; label: string }[] = [
  { key: "body_text", label: "Body Text" },
  { key: "buttons_text", label: "Buttons Text" },
  { key: "input_labels", label: "Input Labels" },
  { key: "links", label: "Links" },
  { key: "subtitle", label: "Subtitle" },
  { key: "title", label: "Title" },
];

export function ThemesTab() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h3 className="text-lg font-semibold">Theme Configuration</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the visual theme for your authentication pages. These
          settings control colors, fonts, and layout.
        </p>
      </div>

      <TextInput source="themes.displayName" label="Display Name" />

      <section className="flex flex-col gap-4">
        <h4 className="text-base font-semibold">Colors</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {colorFields.map((f) => (
            <ColorInput key={f.source} source={f.source} label={f.label} />
          ))}
        </div>
        <SelectInput
          source="themes.colors.captcha_widget_theme"
          label="Captcha Widget Theme"
          choices={[
            { id: "auto", name: "Auto" },
            { id: "dark", name: "Dark" },
            { id: "light", name: "Light" },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h4 className="text-base font-semibold">Borders</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <NumberInput
            source="themes.borders.button_border_radius"
            label="Button Border Radius"
          />
          <NumberInput
            source="themes.borders.button_border_weight"
            label="Button Border Weight"
          />
          <NumberInput
            source="themes.borders.input_border_radius"
            label="Input Border Radius"
          />
          <NumberInput
            source="themes.borders.input_border_weight"
            label="Input Border Weight"
          />
          <NumberInput
            source="themes.borders.widget_border_weight"
            label="Widget Border Weight"
          />
          <NumberInput
            source="themes.borders.widget_corner_radius"
            label="Widget Corner Radius"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectInput
            source="themes.borders.buttons_style"
            label="Buttons Style"
            choices={[
              { id: "pill", name: "Pill" },
              { id: "rounded", name: "Rounded" },
              { id: "sharp", name: "Sharp" },
            ]}
          />
          <SelectInput
            source="themes.borders.inputs_style"
            label="Inputs Style"
            choices={[
              { id: "pill", name: "Pill" },
              { id: "rounded", name: "Rounded" },
              { id: "sharp", name: "Sharp" },
            ]}
          />
        </div>
        <BooleanInput
          source="themes.borders.show_widget_shadow"
          label="Show Widget Shadow"
        />
      </section>

      <section className="flex flex-col gap-4">
        <h4 className="text-base font-semibold">Fonts</h4>
        <TextInput
          source="themes.fonts.font_url"
          label="Font URL"
          parse={keepEmptyString}
        />
        <NumberInput
          source="themes.fonts.reference_text_size"
          label="Reference Text Size"
        />
        {fontSections.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <div className="text-sm font-medium">{label}</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <BooleanInput source={`themes.fonts.${key}.bold`} label="Bold" />
              <NumberInput source={`themes.fonts.${key}.size`} label="Size" />
            </div>
          </div>
        ))}
        <SelectInput
          source="themes.fonts.links_style"
          label="Links Style"
          choices={[
            { id: "normal", name: "Normal" },
            { id: "underlined", name: "Underlined" },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h4 className="text-base font-semibold">Page Background</h4>
        <ColorInput
          source="themes.page_background.background_color"
          label="Background Color"
        />
        <TextInput
          source="themes.page_background.background_image_url"
          label="Background Image URL"
          parse={keepEmptyString}
        />
        <SelectInput
          source="themes.page_background.page_layout"
          label="Page Layout"
          choices={[
            { id: "center", name: "Center" },
            { id: "left", name: "Left" },
            { id: "right", name: "Right" },
          ]}
        />
        <SelectInput
          source="themes.page_background.logo_placement"
          label="Logo Placement"
          helperText="Where the tenant logo renders on the page. Chip suppresses the widget's internal logo."
          choices={[
            { id: "widget", name: "Inside widget (default)" },
            { id: "chip", name: "Floating chip (top-left)" },
            { id: "none", name: "None" },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h4 className="text-base font-semibold">Widget</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectInput
            source="themes.widget.header_text_alignment"
            label="Header Text Alignment"
            choices={[
              { id: "center", name: "Center" },
              { id: "left", name: "Left" },
              { id: "right", name: "Right" },
            ]}
          />
          <NumberInput source="themes.widget.logo_height" label="Logo Height" />
          <SelectInput
            source="themes.widget.logo_position"
            label="Logo Position"
            choices={[
              { id: "center", name: "Center" },
              { id: "left", name: "Left" },
              { id: "none", name: "None" },
              { id: "right", name: "Right" },
            ]}
          />
          <SelectInput
            source="themes.widget.social_buttons_layout"
            label="Social Buttons Layout"
            choices={[
              { id: "bottom", name: "Bottom" },
              { id: "top", name: "Top" },
            ]}
          />
        </div>
        <TextInput
          source="themes.widget.logo_url"
          label="Logo URL"
          parse={keepEmptyString}
        />
      </section>
    </div>
  );
}
