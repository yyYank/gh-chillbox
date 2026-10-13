import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initAppStorage } from "./app-storage";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

initAppStorage().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
