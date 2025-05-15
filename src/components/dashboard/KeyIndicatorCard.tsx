import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface KeyIndicatorCardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  description?: React.ReactNode;
  className?: string;
  iconColorClassName?: string;
}

export default function KeyIndicatorCard({ title, value, icon: Icon, description, className, iconColorClassName = "text-primary" }: KeyIndicatorCardProps) {
  return (
    <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-5 w-5", iconColorClassName)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground pt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Helper for cn if not globally available in this file (though it should be via utils)
// This is a fallback, prefer importing from @/lib/utils
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');
