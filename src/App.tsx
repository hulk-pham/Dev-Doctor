import { AppShell } from "./components/layout/AppShell";
import { AppStateProvider } from "./state/AppState";

export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
