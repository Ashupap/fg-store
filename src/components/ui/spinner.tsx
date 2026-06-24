import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SpinnerProps {
  className?: string;
  size?: number;
}

function Spinner({ className, size = 20 }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-muted-foreground", className)}
      size={size}
    />
  )
}

function PageSpinner({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-muted-foreground">
      <Spinner size={40} className="text-primary mb-4" />
      <p className="text-sm font-semibold tracking-wide">{message}</p>
    </div>
  )
}

export { Spinner, PageSpinner }
