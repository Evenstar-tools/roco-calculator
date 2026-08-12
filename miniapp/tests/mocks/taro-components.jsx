import React from "react";

export function View({ catchMove, children, hoverClass, ...props }) {
  return (
    <div
      data-catch-move={catchMove ? "true" : "false"}
      data-hover-class={hoverClass}
      {...props}
    >
      {children}
    </div>
  );
}

export function Text({ children, ...props }) {
  return <span {...props}>{children}</span>;
}

export const Button = React.forwardRef(function Button(
  { children, hoverClass, openType, ...props },
  ref,
) {
  return (
    <button
      data-hover-class={hoverClass}
      data-open-type={openType}
      ref={ref}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
});

export function Image({ alt, ...props }) {
  return <img alt={alt} {...props} />;
}

export function Input({
  adjustPosition,
  confirmType,
  focus,
  onKeyboardHeightChange,
  ...props
}) {
  return (
    <input
      autoFocus={focus || undefined}
      data-adjust-position={adjustPosition === false ? "false" : "true"}
      data-confirm-type={confirmType}
      data-keyboard-height-handler={
        typeof onKeyboardHeightChange === "function" ? "true" : "false"
      }
      {...props}
    />
  );
}

export function ScrollView({
  children,
  scrollIntoView,
  scrollY,
  showScrollbar: _showScrollbar,
  ...props
}) {
  return (
    <div
      data-scroll-into-view={scrollIntoView}
      data-scroll-y={scrollY ? "true" : "false"}
      {...props}
    >
      {children}
    </div>
  );
}

export function Progress({
  percent,
  active: _active,
  activeMode: _activeMode,
  showInfo: _showInfo,
  ...props
}) {
  return <progress value={percent} max="100" {...props} />;
}
