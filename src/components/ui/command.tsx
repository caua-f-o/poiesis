import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive ref={ref} className={cn("flex h-full w-full flex-col overflow-hidden bg-transparent text-md-on-surface", className)} {...props} />
  )
);
Command.displayName = CommandPrimitive.displayName;

/** "Search view" do Material 3 em forma de diálogo. */
const CommandDialog = ({ children, ...props }: DialogProps) => (
  <Dialog {...props}>
    <DialogContent hideClose className="top-[18%] max-w-[600px] translate-y-0 gap-0 overflow-hidden p-0">
      <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
      <Command loop>{children}</Command>
    </DialogContent>
  </Dialog>
);

const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(
  ({ className, ...props }, ref) => (
    <div className="flex h-14 items-center gap-3 border-b border-md-outline-v px-5" cmdk-input-wrapper="">
      <span className="msr text-md-on-variant" style={{ fontSize: 22 }}>search</span>
      <CommandPrimitive.Input
        ref={ref}
        className={cn("h-full w-full bg-transparent text-[15px] outline-none placeholder:text-md-outline", className)}
        {...props}
      />
    </div>
  )
);
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => <CommandPrimitive.List ref={ref} className={cn("max-h-[420px] overflow-y-auto overflow-x-hidden py-2", className)} {...props} />
);
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Empty>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>>(
  (props, ref) => <CommandPrimitive.Empty ref={ref} className="py-8 text-center text-[13px] text-md-on-variant" {...props} />
);
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Group>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        "overflow-hidden px-2 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-md-on-variant",
        className
      )}
      {...props}
    />
  )
);
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>>(
  ({ className, ...props }, ref) => <CommandPrimitive.Separator ref={ref} className={cn("mx-4 my-1 h-px bg-md-outline-v", className)} {...props} />
);
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex h-10 cursor-default select-none items-center gap-3 rounded-full px-4 text-[13.5px] outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-md-secondary-c data-[selected=true]:text-md-on-secondary-c data-[disabled=true]:opacity-40",
        className
      )}
      {...props}
    />
  )
);
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("ml-auto font-code text-[11px] text-md-outline", className)} {...props} />
);

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator };
