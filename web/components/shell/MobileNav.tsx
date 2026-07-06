"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Sidebar } from "./Sidebar";
import type { Role } from "./nav-items";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded-md p-2 text-muted-foreground hover:text-foreground md:hidden">
        <Menu className="size-5" />
        <span className="sr-only">Open menu</span>
      </DialogTrigger>
      <DialogContent
        showClose={false}
        className="fixed inset-y-0 left-0 top-0 h-full max-w-64 translate-x-0 translate-y-0 rounded-none rounded-r-xl p-0"
      >
        <div onClick={() => setOpen(false)}>
          <Sidebar role={role} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
