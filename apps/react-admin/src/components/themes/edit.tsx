import {
  Edit,
  TextInput,
  NumberInput,
  BooleanInput,
  SelectInput,
  SimpleForm,
} from "react-admin";
import { ColorInput } from "react-admin-color-picker";

export function ThemesEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="displayName" label="Display Name" />

        {/* Colors Section */}
        <h3 style={{ marginTop: 24, marginBottom: 16 }}>Colors</h3>
        <ColorInput source="colors.primary_button" label="Primary Button" />
        <ColorInput
          source="colors.primary_button_label"
          label="Primary Button Label"
        />
        <ColorInput
          source="colors.secondary_button_border"
          label="Secondary Button Border"
        />
        <ColorInput
          source="colors.secondary_button_label"
          label="Secondary Button Label"
        />
        <ColorInput source="colors.base_focus_color" label="Base Focus Color" />
        <ColorInput source="colors.base_hover_color" label="Base Hover Color" />
        <ColorInput source="colors.body_text" label="Body Text" />
        <SelectInput
          source="colors.captcha_widget_theme"
          label="Captcha Widget Theme"
          choices={[{ id: "auto", name: "Auto" }]}
        />
        <ColorInput source="colors.error" label="Error" />
        <ColorInput source="colors.header" label="Header" />
        <ColorInput source="colors.icons" label="Icons" />
        <ColorInput source="colors.input_background" label="Input Background" />
        <ColorInput source="colors.input_border" label="Input Border" />
        <ColorInput
          source="colors.input_filled_text"
          label="Input Filled Text"
        />
        <ColorInput
          source="colors.input_labels_placeholders"
          label="Input Labels/Placeholders"
        />
        <ColorInput
          source="colors.links_focused_components"
          label="Links/Focused Components"
        />
        <ColorInput source="colors.success" label="Success" />
        <ColorInput
          source="colors.widget_background"
          label="Widget Background"
        />
        <ColorInput source="colors.widget_border" label="Widget Border" />

        {/* Borders Section */}
        <h3 style={{ marginTop: 24, marginBottom: 16 }}>Borders</h3>
        <NumberInput
          source="borders.button_border_radius"
          label="Button Border Radius"
        />
        <NumberInput
          source="borders.button_border_weight"
          label="Button Border Weight"
        />
        <SelectInput
          source="borders.buttons_style"
          label="Buttons Style"
          choices={[
            { id: "pill", name: "Pill" },
            { id: "rounded", name: "Rounded" },
            { id: "sharp", name: "Sharp" },
          ]}
        />
        <NumberInput
          source="borders.input_border_radius"
          label="Input Border Radius"
        />
        <NumberInput
          source="borders.input_border_weight"
          label="Input Border Weight"
        />
        <SelectInput
          source="borders.inputs_style"
          label="Inputs Style"
          choices={[
            { id: "pill", name: "Pill" },
            { id: "rounded", name: "Rounded" },
            { id: "sharp", name: "Sharp" },
          ]}
        />
        <BooleanInput
          source="borders.show_widget_shadow"
          label="Show Widget Shadow"
        />
        <NumberInput
          source="borders.widget_border_weight"
          label="Widget Border Weight"
        />
        <NumberInput
          source="borders.widget_corner_radius"
          label="Widget Corner Radius"
        />

        {/* Fonts Section */}
        <h3 style={{ marginTop: 24, marginBottom: 16 }}>Fonts</h3>
        <TextInput source="fonts.font_url" label="Font URL" fullWidth />
        <NumberInput
          source="fonts.reference_text_size"
          label="Reference Text Size"
        />

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Body Text</h4>
        <BooleanInput source="fonts.body_text.bold" label="Bold" />
        <NumberInput source="fonts.body_text.size" label="Size" />

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Button Text</h4>
        <BooleanInput source="fonts.buttons_text.bold" label="Bold" />
        <NumberInput source="fonts.buttons_text.size" label="Size" />

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Input Labels</h4>
        <BooleanInput source="fonts.input_labels.bold" label="Bold" />
        <NumberInput source="fonts.input_labels.size" label="Size" />

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Links</h4>
        <BooleanInput source="fonts.links.bold" label="Bold" />
        <NumberInput source="fonts.links.size" label="Size" />
        <SelectInput
          source="fonts.links_style"
          label="Links Style"
          choices={[
            { id: "normal", name: "Normal" },
            { id: "underlined", name: "Underlined" },
          ]}
        />

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Subtitle</h4>
        <BooleanInput source="fonts.subtitle.bold" label="Bold" />
        <NumberInput source="fonts.subtitle.size" label="Size" />

        <h4 style={{ marginTop: 16, marginBottom: 8 }}>Title</h4>
        <BooleanInput source="fonts.title.bold" label="Bold" />
        <NumberInput source="fonts.title.size" label="Size" />

        {/* Page Background Section */}
        <h3 style={{ marginTop: 24, marginBottom: 16 }}>Page Background</h3>
        <ColorInput
          source="page_background.background_color"
          label="Background Color"
        />
        <TextInput
          source="page_background.background_image_url"
          label="Background Image URL"
          fullWidth
        />
        <SelectInput
          source="page_background.page_layout"
          label="Page Layout"
          choices={[{ id: "center", name: "Center" }]}
        />

        {/* Widget Section */}
        <h3 style={{ marginTop: 24, marginBottom: 16 }}>Widget</h3>
        <SelectInput
          source="widget.header_text_alignment"
          label="Header Text Alignment"
          choices={[{ id: "center", name: "Center" }]}
        />
        <NumberInput source="widget.logo_height" label="Logo Height" />
        <SelectInput
          source="widget.logo_position"
          label="Logo Position"
          choices={[
            { id: "center", name: "Center" },
            { id: "left", name: "Left" },
            { id: "none", name: "None" },
            { id: "right", name: "Right" },
          ]}
        />
        <TextInput source="widget.logo_url" label="Logo URL" fullWidth />
        <SelectInput
          source="widget.social_buttons_layout"
          label="Social Buttons Layout"
          choices={[
            { id: "bottom", name: "Bottom" },
            { id: "top", name: "Top" },
          ]}
        />
      </SimpleForm>
    </Edit>
  );
}
