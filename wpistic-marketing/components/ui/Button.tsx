import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";

type Variant = "primary" | "green" | "outline" | "ghost" | "white";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-ink-900 text-white shadow-[0_2px_10px_rgba(18,40,67,0.3)] hover:bg-[#0a1a2e] hover:shadow-[0_8px_28px_rgba(18,40,67,0.4)]",
  green:
    "bg-green-500 text-white shadow-[0_2px_10px_rgba(0,192,75,0.25)] hover:bg-green-600 hover:shadow-[0_8px_28px_rgba(0,192,75,0.35)]",
  outline: "border border-purple-300 text-purple-600 hover:bg-purple-50",
  ghost: "text-ink-700 hover:bg-ink-100",
  white: "bg-white text-purple-600 shadow-md hover:shadow-lg",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-sm px-4 py-2 gap-1.5",
  md: "text-[15px] px-5 py-2.5 gap-2",
  lg: "text-base px-7 py-3.5 gap-2.5",
};

interface CommonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  icon?: string;
  iconPosition?: "left" | "right";
}

interface LinkButtonProps extends CommonProps {
  href: string;
  external?: boolean;
}

interface ClickButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  href?: undefined;
}

export function Button(props: LinkButtonProps | ClickButtonProps) {
  const {
    children,
    variant = "primary",
    size = "md",
    className = "",
    icon,
    iconPosition = "right",
  } = props;

  const classes = `inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-all duration-200 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  const content = (
    <>
      {icon && iconPosition === "left" && <Icon name={icon} size={size === "lg" ? 18 : 15} />}
      {children}
      {icon && iconPosition === "right" && <Icon name={icon} size={size === "lg" ? 18 : 15} />}
    </>
  );

  if ("href" in props && props.href) {
    if (props.external) {
      return (
        <a href={props.href} className={classes} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }
    return (
      <Link href={props.href} className={classes}>
        {content}
      </Link>
    );
  }

  const { href: _href, external: _external, ...buttonProps } = props as ClickButtonProps & {
    external?: boolean;
  };
  void _href;
  void _external;

  return (
    <button className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
