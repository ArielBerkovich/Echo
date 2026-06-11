import echoLogo from "../assets/echo-logo.png";

// Echo brand mark (uploaded artwork with a transparent background).
export default function Logo({ size = 40 }) {
  return (
    <img
      src={echoLogo}
      width={size}
      height={size}
      className="echo-logo"
      alt="Echo"
      style={{ objectFit: "contain" }}
    />
  );
}
