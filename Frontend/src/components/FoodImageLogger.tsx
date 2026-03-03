import { useState, useRef, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Check, Trash2, Edit2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/api";

interface DetectedItem {
  id: number;
  name: string;
  quantity: string;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  confirmed: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (items: DetectedItem[]) => void;
}

type DummyAnalyzeResponse = {
  mode: "dummy_future_scope" | string;
  notice: string;
  detectedItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  }>;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}

export function FoodImageLogger({ isOpen, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const continueManual = () => {
    setAnalysisNotice("Manual mode active. Auto-detection is dummy future scope.");
    setItems([]);
    setStep("review");
  };

  const handleImageUpload = async (event?: ChangeEvent<HTMLInputElement>) => {
    const file = event?.target.files?.[0];
    if (!file) {
      continueManual();
      return;
    }

    try {
      setAnalyzing(true);
      setAnalysisError("");
      const imageDataUrl = await fileToDataUrl(file);
      const resp = await apiRequest<DummyAnalyzeResponse>("/api/nutrition/food/analyze", {
        method: "POST",
        body: {
          imageDataUrl,
          fileName: file.name
        }
      });

      const mapped = (resp.detectedItems || []).map((item, index) => ({
        id: index + 1,
        name: item.name,
        quantity: String(item.quantity),
        unit: item.unit,
        calories: Number(item.calories || 0),
        protein: Number(item.protein || 0),
        carbs: Number(item.carbs || 0),
        fats: Number(item.fats || 0),
        confirmed: true
      }));

      setItems(mapped);
      setAnalysisNotice(resp.notice || "Dummy analysis loaded.");
      setStep("review");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Image analysis failed");
      continueManual();
    } finally {
      setAnalyzing(false);
      if (event?.target) {
        event.target.value = "";
      }
    }
  };

  const toggleConfirm = (id: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, confirmed: !item.confirmed } : item
    ));
  };

  const updateItem = (id: number, field: keyof DetectedItem, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (field === "calories" || field === "protein" || field === "carbs" || field === "fats") {
          const next = Number(value);
          return { ...item, [field]: Number.isFinite(next) ? next : 0 };
        }

        return { ...item, [field]: value };
      })
    );
  };

  const removeItem = (id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const addItem = () => {
    const newId = Math.max(...items.map(i => i.id), 0) + 1;
    setItems(prev => [...prev, {
      id: newId, name: "New Item", quantity: "1", unit: "serving",
      calories: 0, protein: 0, carbs: 0, fats: 0, confirmed: true
    }]);
    setEditingId(newId);
  };

  const handleConfirmLog = () => {
    const confirmedItems = items.filter(i => i.confirmed);
    onConfirm(confirmedItems);
    handleClose();
  };

  const handleClose = () => {
    setStep("upload");
    setItems([]);
    setEditingId(null);
    setAnalysisNotice("");
    setAnalysisError("");
    setAnalyzing(false);
    onClose();
  };

  const confirmedItems = items.filter(i => i.confirmed);
  const totalCalories = confirmedItems.reduce((s, i) => s + i.calories, 0);
  const totalProtein = confirmedItems.reduce((s, i) => s + i.protein, 0);
  const totalCarbs = confirmedItems.reduce((s, i) => s + i.carbs, 0);
  const totalFats = confirmedItems.reduce((s, i) => s + i.fats, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl glass-card-elevated border-t border-border/50 p-4 pb-28"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">
              {step === "upload" ? "Log Food via Image" : "Review Detected Items"}
            </h3>
            <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-secondary transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {step === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/60 rounded-xl p-8 text-center cursor-pointer hover:border-ahara/50 transition-colors"
              >
                <Camera className="h-10 w-10 text-ahara mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium">Tap to upload food photo</p>
                <p className="text-xs text-muted-foreground mt-1">Dummy auto-detection (future scope)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleImageUpload(e);
                }}
              />
              <Button
                onClick={() => {
                  setAnalysisError("");
                  continueManual();
                }}
                className="w-full rounded-xl bg-ahara hover:bg-ahara/90 text-white"
                disabled={analyzing}
              >
                <Camera className="mr-2 h-4 w-4" /> {analyzing ? "Analyzing..." : "Continue Without Auto-Detection"}
              </Button>
              {analysisError && <p className="text-xs text-critical">{analysisError}</p>}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              {analysisNotice && <p className="text-xs text-muted-foreground">{analysisNotice}</p>}
              {/* Summary bar */}
              <div className="glass-card p-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{confirmedItems.length} items selected</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-ahara font-semibold">{totalCalories} cal</span>
                  <span className="text-foreground">P: {totalProtein}g</span>
                  <span className="text-foreground">C: {totalCarbs}g</span>
                  <span className="text-foreground">F: {totalFats}g</span>
                </div>
              </div>

              {/* Items */}
              {items.length === 0 && (
                <div className="glass-card p-4 text-sm text-muted-foreground">
                  No items detected. Add items manually and enter calories/macros for real DB logging.
                </div>
              )}
              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    className={`glass-card p-3 ${!item.confirmed ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={item.confirmed}
                        onCheckedChange={() => toggleConfirm(item.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={item.name}
                              onChange={(e) => updateItem(item.id, "name", e.target.value)}
                              className="h-7 text-xs"
                              placeholder="Food item name"
                            />
                            <div className="flex gap-2">
                              <Input
                                value={item.quantity}
                                onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                                className="h-7 text-xs w-20"
                                placeholder="Qty"
                              />
                              <Input
                                value={item.unit}
                                onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                                className="h-7 text-xs w-24"
                                placeholder="Unit"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={String(item.calories)}
                                onChange={(e) => updateItem(item.id, "calories", e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Calories (per unit)"
                              />
                              <Input
                                value={String(item.protein)}
                                onChange={(e) => updateItem(item.id, "protein", e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Protein g"
                              />
                              <Input
                                value={String(item.carbs)}
                                onChange={(e) => updateItem(item.id, "carbs", e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Carbs g"
                              />
                              <Input
                                value={String(item.fats)}
                                onChange={(e) => updateItem(item.id, "fats", e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Fats g"
                              />
                            </div>
                            <button onClick={() => setEditingId(null)} className="text-xs text-gyaan">Done</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => setEditingId(item.id)} className="p-1 rounded hover:bg-secondary">
                                  <Edit2 className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-secondary">
                                  <Trash2 className="h-3 w-3 text-critical" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} {item.unit} • {item.calories} cal/unit
                            </p>
                            <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>P: {item.protein}g</span>
                              <span>C: {item.carbs}g</span>
                              <span>F: {item.fats}g</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Add item */}
              <button
                onClick={addItem}
                className="w-full glass-card p-2.5 flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add item manually
              </button>

              {/* Confirm */}
              <Button
                onClick={handleConfirmLog}
                disabled={confirmedItems.length === 0}
                className="w-full rounded-xl bg-ahara hover:bg-ahara/90 text-white"
              >
                <Check className="mr-2 h-4 w-4" /> Confirm & Log Meal ({confirmedItems.length} items)
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
