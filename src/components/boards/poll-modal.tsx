"use client";

import { useState } from "react";
import { Plus, X, MessageSquare, Users, Clock, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PollModalProps {
  boardId: string;
  itemId?: string | null;
  open: boolean;
  onClose: () => void;
  onCreate: (data: { boardId: string; itemId?: string; question: string; options: string[]; isAnonymous: boolean; isMultiSelect: boolean; closesAt: string | null }) => void;
}

export function PollModal({ boardId, itemId, open, onClose, onCreate }: PollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [hasClosingTime, setHasClosingTime] = useState(false);
  const [closesAt, setClosesAt] = useState("");

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const handleSubmit = () => {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);

    if (!trimmedQuestion || trimmedOptions.length < 2) return;

    onCreate({
      boardId,
      itemId: itemId ?? undefined,
      question: trimmedQuestion,
      options: trimmedOptions,
      isAnonymous,
      isMultiSelect,
      closesAt: hasClosingTime && closesAt ? new Date(closesAt).toISOString() : null,
    });

    // Reset
    setQuestion("");
    setOptions(["", ""]);
    setIsAnonymous(false);
    setIsMultiSelect(false);
    setHasClosingTime(false);
    setClosesAt("");
    onClose();
  };

  const isValid = question.trim().length > 0 && options.filter((o) => o.trim().length > 0).length >= 2;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-mamba-600" />
            Create Poll
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Question */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Question</label>
            <Input
              placeholder="What would you like to ask?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="text-sm"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Options</label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                  {idx + 1}.
                </span>
                <Input
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeOption(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={addOption}
              >
                <Plus className="mr-1 h-3 w-3" /> Add option ({options.length}/10)
              </Button>
            )}
          </div>

          {/* Toggles */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">Anonymous voting</span>
              </div>
              <Switch
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
                className="scale-75"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">Multi-select</span>
              </div>
              <Switch
                checked={isMultiSelect}
                onCheckedChange={setIsMultiSelect}
                className="scale-75"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">Set closing time</span>
              </div>
              <Switch
                checked={hasClosingTime}
                onCheckedChange={setHasClosingTime}
                className="scale-75"
              />
            </div>

            {hasClosingTime && (
              <Input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="h-8 text-xs"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-mamba-600 hover:bg-mamba-700"
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Create Poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
