import "@mantine/core/styles.css";
import "./m3e/theme/tokens.css";
import "./app.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SnackbarProvider } from "./Snackbar";
import { I18nProvider } from "./i18n/I18n";
import { colorSchemeManager, createThemeColors, theme } from "./m3e/theme/theme";
import { defaultColorScheme, readColorProfile, saveColorProfile } from "./m3e/theme/colorProfile";

function Root() {
  const [profile, setProfile] = useState(readColorProfile);
  const { resolver, effectiveSpec } = useMemo(() => createThemeColors(profile), [profile]);
  useEffect(() => saveColorProfile(profile), [profile]);

  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} defaultColorScheme={defaultColorScheme} colorSchemeManager={colorSchemeManager}>
      <I18nProvider>
        <SnackbarProvider>
          <App profile={profile} effectiveSpec={effectiveSpec} setProfile={setProfile} />
        </SnackbarProvider>
      </I18nProvider>
    </MantineProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing application root");

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
