import { useEffect } from "react";

import { MainLayout } from "./components/MainLayout";
import { applyAppTheme } from "./lib/themes";
import { useSettingsStore } from "./stores/useSettingsStore";
import "./App.css";

function App() {
  const theme = useSettingsStore((s) => s.terminalTheme);

  useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  return <MainLayout />;
}

export default App;
