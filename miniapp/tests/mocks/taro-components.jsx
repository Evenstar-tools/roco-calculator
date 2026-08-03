import React from "react";

export function View({ catchMove, children, ...props }) {
  return (
    <div
      data-catch-move={catchMove ? "true" : "false"}
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
  { children, openType, ...props },
  ref,
) {
  return (
    <button
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

export function Input(props) {
  return <input {...props} />;
}

export function ScrollView({
  children,
  scrollY,
  showScrollbar: _showScrollbar,
  ...props
}) {
  return (
    <div data-scroll-y={scrollY ? "true" : "false"} {...props}>
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
