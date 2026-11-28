import { Path, Svg, type IconProps } from "../_internal";

export default function IconLine(props: IconProps) {
  return (
    <Svg {...props}>
      <Path d="M2 2L22 22" />
    </Svg>
  );
}
