import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

/* shadcn/ui 스타일 공통 툴팁 — Radix Tooltip 기반, SafeRobo DS 토큰 적용.
 * 사용: <TooltipProvider> 하위에서
 *   <Tooltip><TooltipTrigger asChild>…</TooltipTrigger><TooltipContent>라벨</TooltipContent></Tooltip> */

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className = '', sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`z-[60] max-w-64 overflow-hidden rounded-md border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs leading-snug text-ink shadow-lg select-none ${className}`}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
