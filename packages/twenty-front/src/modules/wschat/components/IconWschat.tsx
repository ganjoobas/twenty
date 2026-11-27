import { type IconComponentProps } from 'twenty-ui/icon';

import { WSCHAT_BRAND_COLORS } from '@/wschat/constants/WschatBrandColors';

type IconWschatProps = IconComponentProps;

// WSChat's favicon.svg as is: its own colours on both themes, so `color` and `stroke` are ignored
export const IconWschat = ({
  size = 24,
  className,
  style,
  'aria-hidden': ariaHidden,
}: IconWschatProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    width={size}
    height={size}
    className={className}
    style={style}
    aria-hidden={ariaHidden}
  >
    <path
      d="M22 4H42A18 18 0 0 1 60 22V36A18 18 0 0 1 42 54H22L9 61.5L11.5 49.5A18 18 0 0 1 4 36V22A18 18 0 0 1 22 4Z"
      fill={WSCHAT_BRAND_COLORS.green}
    />
    <path
      d="M14.5 21.5L21.5 39L28 26.5L32 34L36 26.5L42.5 39L47.5 27"
      fill="none"
      stroke={WSCHAT_BRAND_COLORS.ink}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="50.5" cy="18.5" r="3.6" fill={WSCHAT_BRAND_COLORS.ink} />
  </svg>
);
