// Re-research button + cost-gate confirmation dialog. Lives in the company page utility bar.
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RefreshButtonProps {
  companyName: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: () => void;
}

export function RefreshButton({ companyName, disabled, busy, onConfirm }: RefreshButtonProps) {
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    setOpen(false);
    onConfirm();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={busy ? "Re-researching" : "Re-research"}
        className="gap-1.5"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          letterSpacing: "0.02em",
          color: "var(--text-soft)",
        }}
      >
        <RefreshCw
          className={busy ? "animate-spin" : undefined}
          style={{ width: 12, height: 12 }}
        />
        {busy ? "Re-researching…" : "Re-research"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-research {companyName}?</DialogTitle>
            <DialogDescription>
              This spends ~$0.15 in OpenRouter API costs and overwrites the current cached report.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              autoFocus
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Re-research</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
