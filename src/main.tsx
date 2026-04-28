import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode намеренно отключён: он дважды монтирует компоненты и
// в нашей архитектуре приводит к удвоенным RPC-подпискам.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
