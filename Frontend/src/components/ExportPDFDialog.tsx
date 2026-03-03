import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportPDFDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onExport: (range: string) => void;
}

const ranges = ["Daily", "Weekly", "Monthly", "Yearly"];

export function ExportPDFDialog({ isOpen, onClose, title, onExport }: ExportPDFDialogProps) {
  const [selected, setSelected] = useState("Weekly");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
        <div className="fixed inset-0 bg-black/40" />
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative z-50 w-full max-w-md rounded-t-2xl bg-background border border-border/50 p-5 pb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Export {title}</h3>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-3">Select time range</p>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {ranges.map((r) => (
              <button
                key={r}
                onClick={() => setSelected(r)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  selected === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <Button
            onClick={() => { onExport(selected); onClose(); }}
            className="w-full gap-2"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
