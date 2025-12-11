import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export function JsonOutput({ data }: { data: any }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      component="pre"
      sx={{
        backgroundColor: isDark ? theme.palette.background.paper : "#f5f5f5",
        color: theme.palette.text.primary,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: "4px",
        padding: 2,
        overflow: "auto",
        fontSize: "0.9rem",
        fontFamily: "monospace",
        margin: 0,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </Box>
  );
}
