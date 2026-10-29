import { Component } from "react";
import { translateUi } from "../i18n/messages.js";

// Lazy imports reject during rendering; offer recovery without exposing internals.
export class RuntimeErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = (source) => translateUi(this.props.locale, source);
    return <div className="app"><main className="loading-state" role="alert"><div>
      <p>{t("页面无法显示，请重新加载。")}</p>
      <button className="secondary-action" type="button" onClick={() => globalThis.location.reload()}>{t("重新加载")}</button>
    </div></main></div>;
  }
}
