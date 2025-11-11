"use client"

import * as React from "react"
import { LayerMask01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import { Button } from "./ui/button"

export function ModeSwitcher() {
  const { setTheme, resolvedTheme } = useTheme()

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative size-8"
      onClick={toggleTheme}
      title="Toggle theme"
    >
      <HugeiconsIcon
        icon={LayerMask01Icon}
        className="size-4 -rotate-45"
        strokeWidth={2}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
