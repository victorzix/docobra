import { Ruler } from "lucide-react";

export function Logo({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "light";
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-cyan-500">
        <Ruler className="size-5 text-[#08243f]" strokeWidth={2.25} />
      </div>
      <span
        className={`text-lg font-semibold tracking-tight ${
          variant === "dark" ? "text-white" : "text-foreground"
        }`}
      >
        DocObra
      </span>
    </div>
  );
}
