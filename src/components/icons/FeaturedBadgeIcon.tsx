import React from "react";
import { Sparkles } from "lucide-react";

interface FeaturedBadgeIconProps {
  className?: string;
}

export const FeaturedBadgeIcon: React.FC<FeaturedBadgeIconProps> = ({
  className = "h-4 w-4 text-amber-500 fill-amber-500",
}) => <Sparkles className={className} />;