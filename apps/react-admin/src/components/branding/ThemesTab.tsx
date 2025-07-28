import {
  TextInput,
  NumberInput,
  BooleanInput,
  SelectInput,
} from "react-admin";
import { ColorInput } from "react-admin-color-picker";
import { Box, Typography, Divider } from "@mui/material";

export function ThemesTab() {
  return (
    <Box sx={{ maxWidth: 800, padding: 2 }}>
      <Typography variant="h6" sx={{ mb: 3 }}>
        Theme Configuration
      </Typography>

      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        Configure the visual theme for your authentication pages. These settings control colors, fonts, and layout.
      </Typography>

      <TextInput source="themes.displayName" label="Display Name" fullWidth />

      <Divider sx={{ my: 3 }} />

      {/* Colors Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Colors
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 2,
          mb: 3,
        }}
      >
        <ColorInput source="themes.colors.primary_button" label="Primary Button" />
        <ColorInput
          source="themes.colors.primary_button_label"
          label="Primary Button Label"
        />
        <ColorInput
          source="themes.colors.secondary_button_border"
          label="Secondary Button Border"
        />
        <ColorInput
          source="themes.colors.secondary_button_label"
          label="Secondary Button Label"
        />
        <ColorInput
          source="themes.colors.base_focus_color"
          label="Base Focus Color"
        />
        <ColorInput
          source="themes.colors.base_hover_color"
          label="Base Hover Color"
        />
        <ColorInput source="themes.colors.body_text" label="Body Text" />
        <ColorInput source="themes.colors.error" label="Error" />
        <ColorInput source="themes.colors.header" label="Header" />
        <ColorInput source="themes.colors.icons" label="Icons" />
        <ColorInput
          source="themes.colors.input_background"
          label="Input Background"
        />
        <ColorInput source="themes.colors.input_border" label="Input Border" />
        <ColorInput
          source="themes.colors.input_filled_text"
          label="Input Filled Text"
        />
        <ColorInput
          source="themes.colors.input_labels_placeholders"
          label="Input Labels/Placeholders"
        />
        <ColorInput
          source="themes.colors.links_focused_components"
          label="Links/Focused Components"
        />
        <ColorInput source="themes.colors.success" label="Success" />
        <ColorInput
          source="themes.colors.widget_background"
          label="Widget Background"
        />
        <ColorInput source="themes.colors.widget_border" label="Widget Border" />
      </Box>

      <SelectInput
        source="themes.colors.captcha_widget_theme"
        label="Captcha Widget Theme"
        choices={[
          { id: "auto", name: "Auto" },
          { id: "light", name: "Light" },
          { id: "dark", name: "Dark" },
        ]}
      />

      <Divider sx={{ my: 3 }} />

      {/* Borders Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Borders
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 2,
          mb: 3,
        }}
      >
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
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 2,
          mb: 3,
        }}
      >
        <SelectInput
          source="themes.borders.buttons_style"
          label="Buttons Style"
          choices={[
            { id: "pill", name: "Pill" },
            { id: "rounded", name: "Rounded" },
            { id: "square", name: "Square" },
          ]}
        />
        <SelectInput
          source="themes.borders.inputs_style"
          label="Inputs Style"
          choices={[
            { id: "pill", name: "Pill" },
            { id: "rounded", name: "Rounded" },
            { id: "square", name: "Square" },
          ]}
        />
        <BooleanInput
          source="themes.borders.show_widget_shadow"
          label="Show Widget Shadow"
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Fonts Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Fonts
      </Typography>
      <TextInput source="themes.fonts.font_url" label="Font URL" fullWidth />
      <NumberInput
        source="themes.fonts.reference_text_size"
        label="Reference Text Size"
      />

      {/* Font sections for different text types */}
      {[
        { key: "body_text", label: "Body Text" },
        { key: "buttons_text", label: "Buttons Text" },
        { key: "input_labels", label: "Input Labels" },
        { key: "links", label: "Links" },
        { key: "subtitle", label: "Subtitle" },
        { key: "title", label: "Title" },
      ].map(({ key, label }) => (
        <Box key={key} sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {label}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <BooleanInput source={`themes.fonts.${key}.bold`} label="Bold" />
            <NumberInput source={`themes.fonts.${key}.size`} label="Size" />
          </Box>
        </Box>
      ))}

      <SelectInput
        source="themes.fonts.links_style"
        label="Links Style"
        choices={[
          { id: "normal", name: "Normal" },
          { id: "underline", name: "Underline" },
        ]}
      />

      <Divider sx={{ my: 3 }} />

      {/* Page Background Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Page Background
      </Typography>
      <Box sx={{ mb: 3 }}>
        <ColorInput
          source="themes.page_background.background_color"
          label="Background Color"
        />
        <TextInput
          source="themes.page_background.background_image_url"
          label="Background Image URL"
          fullWidth
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
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Widget Section */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Widget
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 2,
          mb: 3,
        }}
      >
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
            { id: "right", name: "Right" },
          ]}
        />
        <SelectInput
          source="themes.widget.social_buttons_layout"
          label="Social Buttons Layout"
          choices={[
            { id: "bottom", name: "Bottom" },
            { id: "top", name: "Top" },
            { id: "side", name: "Side" },
          ]}
        />
      </Box>

      <TextInput source="themes.widget.logo_url" label="Logo URL" fullWidth />
    </Box>
  );
}
