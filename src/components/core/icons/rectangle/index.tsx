import { Path, Svg, type IconProps } from "../_internal";

export default function IconRectangle(props: IconProps) {
  return (
    <Svg {...props}>
      <Path d="M3 3H21V21H3V3Z" />
    </Svg>
  );
}
