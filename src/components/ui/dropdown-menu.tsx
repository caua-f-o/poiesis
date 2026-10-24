import * as React from "react";
import * as P from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { M } from "./menu-styles";

const DropdownMenu = P.Root;
const DropdownMenuTrigger = P.Trigger;
const DropdownMenuGroup = P.Group;
const DropdownMenuPortal = P.Portal;
const DropdownMenuSub = P.Sub;
const DropdownMenuRadioGroup = P.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<React.ElementRef<typeof P.SubTrigger>, React.ComponentPropsWithoutRef<typeof P.SubTrigger>>(
  ({ className, children, ...props }, ref) => (
    <P.SubTrigger ref={ref} className={cn(M.item, M.sub, className)} {...props}>
      {children}
      <span className="msr ml-auto" style={{ fontSize: 18 }}>chevron_right</span>
    </P.SubTrigger>
  )
);
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

const DropdownMenuSubContent = React.forwardRef<React.ElementRef<typeof P.SubContent>, React.ComponentPropsWithoutRef<typeof P.SubContent>>(
  ({ className, ...props }, ref) => (
    <P.Portal>
      <P.SubContent ref={ref} className={cn(M.content, className)} {...props} />
    </P.Portal>
  )
);
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof P.Content>, React.ComponentPropsWithoutRef<typeof P.Content>>(
  ({ className, sideOffset = 6, ...props }, ref) => (
    <P.Portal>
      <P.Content ref={ref} sideOffset={sideOffset} className={cn(M.content, "max-h-[var(--radix-dropdown-menu-content-available-height)]", className)} {...props} />
    </P.Portal>
  )
);
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof P.Item>, React.ComponentPropsWithoutRef<typeof P.Item>>(
  ({ className, ...props }, ref) => <P.Item ref={ref} className={cn(M.item, className)} {...props} />
);
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuCheckboxItem = React.forwardRef<React.ElementRef<typeof P.CheckboxItem>, React.ComponentPropsWithoutRef<typeof P.CheckboxItem>>(
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
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

const DropdownMenuRadioItem = React.forwardRef<React.ElementRef<typeof P.RadioItem>, React.ComponentPropsWithoutRef<typeof P.RadioItem>>(
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
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof P.Label>, React.ComponentPropsWithoutRef<typeof P.Label>>(
  ({ className, ...props }, ref) => <P.Label ref={ref} className={cn(M.label, className)} {...props} />
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof P.Separator>, React.ComponentPropsWithoutRef<typeof P.Separator>>(
  ({ className, ...props }, ref) => <P.Separator ref={ref} className={cn(M.sep, className)} {...props} />
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span className={cn(M.shortcut, className)} {...props} />;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
