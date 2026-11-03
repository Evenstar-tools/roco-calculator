import { Component, Suspense } from "react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { FeatureLoadingContext, isChunkFailure, reportLoadFailure, resetFailedLoads } from "./chunk-recovery.js";

class FeatureErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    reportLoadFailure(isChunkFailure(error) ? "chunk" : "render", "boundary");
  }

  close = () => {
    resetFailedLoads();
    this.setState({ failed: false });
    this.props.onClose?.();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const { t, onClose } = this.props;
    return <div className="feature-load-error" role="alert">
      <p>{t("这个功能没有打开，计算器不受影响。")}</p>
      <div className="feature-load-error__actions">
        <button className="secondary-action" type="button" onClick={() => globalThis.location.reload()}>{t("重新加载")}</button>
        {onClose ? <button className="secondary-action" type="button" onClick={this.close}>{t("关闭")}</button> : null}
      </div>
    </div>;
  }
}

export function FeatureLoadingBoundary({ fallback, children }) {
  return <FeatureLoadingContext.Provider value={fallback}><Suspense fallback={fallback}>{children}</Suspense></FeatureLoadingContext.Provider>;
}

/** 工具级边界：工具加载或渲染失败时只影响工具自己，不替换整个计算器。 */
export function FeatureBoundary({ fallback, onClose, children }) {
  const { t } = useLocale();
  return <FeatureErrorBoundary t={t} onClose={onClose}><FeatureLoadingBoundary fallback={fallback}>{children}</FeatureLoadingBoundary></FeatureErrorBoundary>;
}
