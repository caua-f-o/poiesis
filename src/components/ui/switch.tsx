import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/** Switch do Material 3: trilho com contorno quando desligado, polegar que cresce ao ligar. */
const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
      ref={ref}
      className={cn(
        "group peer relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-md-primary disabled:cursor-not-allowed disabled:opacity-40",
        "data-[state=checked]:border-md-primary data-[state=checked]:bg-md-primary data-[state=unchecked]:border-md-outline data-[state=unchecked]:bg-md-highest",
        className
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block rounded-full transition-all duration-200 [transition-timing-function:cubic-bezier(.2,0,0,1)]",
          "data-[state=unchecked]:ml-[4px] data-[state=unchecked]:h-3 data-[state=unchecked]:w-3 data-[state=unchecked]:bg-md-outline",
          "data-[state=checked]:ml-[18px] data-[state=checked]:h-4 data-[state=checked]:w-4 data-[state=checked]:bg-md-on-primary"
        )}
      />
    </SwitchPrimitives.Root>
  )
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
