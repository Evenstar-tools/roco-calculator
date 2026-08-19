import Taro, { useLaunch } from "@tarojs/taro";
import { setupUpdateManager } from "./platform/update-manager.js";
import "./app.css";

export default function App({ children }) {
  useLaunch(() => {
    setupUpdateManager({
      environment: process.env.TARO_ENV,
      platform: Taro,
    });
  });

  return children;
}
