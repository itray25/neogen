import React from "react";
import ReactDOM from "react-dom/client";
import App from "../src/App";
import reportWebVitals from "../src/reportWebVitals";
import { BrowserRouter } from "react-router-dom";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // 暂时注释掉StrictMode以避免开发环境的重复API调用
  // <React.StrictMode>
  <BrowserRouter>
    <ChakraProvider value={defaultSystem}>
      <App />
    </ChakraProvider>
  </BrowserRouter>
  // </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
