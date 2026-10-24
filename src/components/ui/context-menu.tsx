import * as React from "react";
import * as P from "@radix-ui/react-context-menu";
import { cn } from "@/lib/utils";
import { M } from "./menu-styles";

const ContextMenu = P.Root;
const ContextMenuTrigger = P.Trigger;
const ContextMenuGroup = P.Group;
const ContextMenuPortal = P.Portal;
const ContextMenuSub = P.Sub;
const ContextMenuRadioGroup = P.RadioGroup;

const ContextMenuSubTrigger = React.forwardRef<React.ElementRef<typeof P.SubTrigger>, React.ComponentPropsWithoutRef<typeof P.SubTrigger>>(
  ({ className, children, ...props }, ref) => (
    <P.SubTrigger ref={ref} className={cn(M.item, M.sub, className)} {...props}>
      {children}
      <span className="msr ml-auto" style={{ fontSize: 18 }}>chevron_right</span>
    </P.SubTrigger>
  )
);
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

const ContextMenuSubContent = React.forwardRef<React.ElementRef<typeof P.SubContent>, React.ComponentPropsWithoutRef<typeof P.SubContent>>(
  ({ className, ...props }, ref) => (
    <P.Portal>
      <P.SubContent ref={ref} className={cn(M.content, className)} {...props} />
    </P.Portal>
  )
);
ContextMenuSubContent.displayName = "ContextMenuSubContent";

const ContextMenuContent = React.forwardRef<React.ElementRef<typeof P.Content>, React.ComponentPropsWithoutRef<typeof P.Content>>(
  ({ className, ...props }, ref) => (
    <P.Portal>
      <P.Content ref={ref} className={cn(M.content, "max-h-[var(--radix-context-menu-content-available-height)]", className)} {...props} />
    </P.Portal>
  )
);
ContextMenuContent.displayName = "ContextMenuContent";

const ContextMenuItem = React.forwardRef<React.ElementRef<typeof P.Item>, React.ComponentPropsWithoutRef<typeof P.Item>>(
  ({ className, ...props }, ref) => <P.Item ref={ref} className={cn(M.item, className)} {...props} />
);
ContextMenuItem.displayName = "ContextMenuItem";

const ContextMenuCheckboxItem = React.forwardRef<React.ElementRef<typeof P.CheckboxItem>, React.ComponentPropsWithoutRef<typeof P.CheckboxItem>>(
  ({ className, children, ...props }, ref) => (
    <P.CheckboxItem ref={ref} className={cn(M.item, "pl-9", className)} {...props}>
      <span className="absolute left-3 flex items-center">
        <P.ItemIndicator>
          <span className="msr" style={{ fontSize: 18 }}>check</span>
        </P.ItemIndicator>
      </span>
      {children}
    </P.CheckboxItem>
  )
);
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

const ContextMenuRadioItem = React.forwardRef<React.ElementRef<typeof P.RadioItem>, React.ComponentPropsWithoutRef<typeof P.RadioItem>>(
  ({ className, children, ...props }, ref) => (
    <P.RadioItem ref={ref} className={cn(M.item, "pl-9", className)} {...props}>
      <span className="absolute left-3 flex items-center">
        <P.ItemIndicator>
          <span className="msr" style={{ fontSize: 18 }}>check</span>
        </P.ItemIndicator>
      </span>
      {children}
    </P.RadioItem>
  )
);
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

const ContextMenuLabel = React.forwardRef<React.ElementRef<typeof P.Label>, React.ComponentPropsWithoutRef<typeof P.Label>>(
  ({ className, ...props }, ref) => <P.Label ref={ref} className={cn(M.label, className)} {...props} />
);
ContextMenuLabel.displayName = "ContextMenuLabel";

const ContextMenuSeparator = React.forwardRef<React.ElementRef<typeof P.Separator>, React.ComponentPropsWithoutRef<typeof P.Separator>>(
  ({ className, ...props }, ref) => <P.Separator ref={ref} className={cn(M.sep, className)} {...props} />
);
ContextMenuSeparator.displayName = "ContextMenuSeparator";

const ContextMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span className={cn(M.shortcut, className)} {...props} />;

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
