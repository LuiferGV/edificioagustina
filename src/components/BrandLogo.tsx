import { useState } from "react";

interface BrandLogoProps {
  alt?: string;
  className?: string;
}

const officialLogoPath = "/logooficial.png";

export function BrandLogo({
  alt = "Edificio Agustina",
  className = "brand-logo",
}: BrandLogoProps) {
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return null;
  }

  return (
    <img
      className={className}
      src={officialLogoPath}
      alt={alt}
      onError={() => setHidden(true)}
    />
  );
}
