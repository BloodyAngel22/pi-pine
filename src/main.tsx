import ReactDOM from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import App from "./App";
import "@mantine/core/styles.css";
import "./styles.css";

const mantineTheme = createTheme({
  fontFamily: "var(--font-sans)",
  fontFamilyMonospace: "var(--font-mono)",
  primaryColor: "violet",
  defaultRadius: "md",
  components: {
    Popover: {
      defaultProps: {
        shadow: "lg",
        radius: "md",
      },
    },
    Tooltip: {
      defaultProps: {
        withArrow: true,
        openDelay: 350,
      },
    },
  },
});

// StrictMode намеренно отключён: он дважды монтирует компоненты и
// в нашей архитектуре приводит к удвоенным RPC-подпискам.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
    <App />
  </MantineProvider>,
);
