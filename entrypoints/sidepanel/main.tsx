import { MotionConfig } from "motion/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app.tsx";
import "@/assets/tailwind.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>
);
