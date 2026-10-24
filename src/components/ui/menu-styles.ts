/** Estilos Material 3 compartilhados entre DropdownMenu e ContextMenu. */
export const M = {
  content:
    "z-50 min-w-[12rem] overflow-y-auto overflow-x-hidden rounded-xl bg-md-container py-1.5 text-md-on-surface shadow-[var(--md-elev-2)] " +
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " +
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
  item:
    "relative mx-1.5 flex h-9 cursor-default select-none items-center gap-3 rounded-lg px-3 text-[13px] outline-none transition-colors " +
    "focus:bg-[color-mix(in_oklab,var(--md-on-surface)_9%,transparent)] data-[highlighted]:bg-[color-mix(in_oklab,var(--md-on-surface)_9%,transparent)] " +
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_.msr]:text-md-on-variant [&>svg]:size-4 [&>svg]:shrink-0",
  sub: "data-[state=open]:bg-[color-mix(in_oklab,var(--md-on-surface)_9%,transparent)]",
  sep: "mx-0 my-1.5 h-px bg-md-outline-v",
  label: "px-4 pb-1 pt-2 text-[11px] font-semibold tracking-[0.06em] text-md-on-variant",
  shortcut: "ml-auto pl-4 font-code text-[11px] tracking-normal text-md-outline",
};
