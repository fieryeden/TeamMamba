"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface PollOption {
  idx: number;
  label: string;
  count: number;
  percentage: number;
  isSelected: boolean;
}

interface PollCardProps {
  poll: {
    id: string;
    question: string;
    options: string[];
    isAnonymous: boolean;
    isMultiSelect: boolean;
    closesAt: string | null;
    createdAt: string | Date;
    creator?: { id: string; firstName: string; lastName: string };
    votes: Array<{ id: string; userId: string; optionIdx: number }>;
    _count?: { votes: number };
  };
  currentUserId: string;
  onVote: (pollId: string, optionIdx: number) => void;
  onRemoveVote: (pollId: string, optionIdx: number) => void;
  onDelete: (pollId: string) => void;
  isCreator?: boolean;
  isAdmin?: boolean;
}

export function PollCard({ poll, currentUserId, onVote, onRemoveVote, onDelete, isCreator, isAdmin }: PollCardProps) {
  const isClosed = poll.closesAt ? new Date() > new Date(poll.closesAt) : false;
  const totalVotes = poll.votes?.length ?? 0;

  const userVotes = useMemo(() => {
    return new Set(
      (poll.votes ?? [])
        .filter((v) => v.userId === currentUserId)
        .map((v) => v.optionIdx)
    );
  }, [poll.votes, currentUserId]);

  const options: PollOption[] = useMemo(() => {
    return poll.options.map((label, idx) => {
      const count = (poll.votes ?? []).filter((v) => v.optionIdx === idx).length;
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      return { idx, label, count, percentage, isSelected: userVotes.has(idx) };
    });
  }, [poll.options, poll.votes, totalVotes, userVotes]);

  const canDelete = isCreator || isAdmin;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug">{poll.question}</h4>
        {canDelete && (
          <button
            className="text-muted-foreground hover:text-destructive text-xs shrink-0"
            onClick={() => onDelete(poll.id)}
            title="Delete poll"
          >
            ✕
          </button>
        )}
      </div>

      {isClosed && (
        <div className="rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground text-center">
          Poll closed
        </div>
      )}

      <div className="space-y-2">
        {options.map((opt) => {
          const action = () => {
            if (isClosed) return;
            if (opt.isSelected) {
              onRemoveVote(poll.id, opt.idx);
            } else {
              onVote(poll.id, opt.idx);
            }
          };

          return (
            <button
              key={opt.idx}
              className={cn(
                "relative w-full overflow-hidden rounded-md border text-left transition-colors",
                !isClosed && "cursor-pointer hover:border-mamba-400",
                isClosed && "cursor-default",
                opt.isSelected
                  ? "border-mamba-500 bg-mamba-50 ring-1 ring-mamba-300"
                  : "border-border bg-background"
              )}
              onClick={action}
              disabled={isClosed}
            >
              {/* Progress bar background */}
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-300",
                  opt.isSelected ? "bg-mamba-100" : "bg-muted/40"
                )}
                style={{ width: `${opt.percentage}%` }}
              />

              <div className="relative flex items-center justify-between px-3 py-2">
                <span className={cn("text-xs", opt.isSelected && "font-medium text-mamba-800")}>
                  {opt.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {opt.count} {opt.count === 1 ? "vote" : "votes"}
                  </span>
                  <span className={cn(
                    "text-[11px] font-medium min-w-[32px] text-right",
                    opt.isSelected ? "text-mamba-700" : "text-muted-foreground"
                  )}>
                    {opt.percentage}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"} total</span>
        {poll.closesAt && !isClosed && (
          <span>Closes {new Date(poll.closesAt).toLocaleString()}</span>
        )}
        {!poll.isAnonymous && poll.creator && (
          <span>By {poll.creator.firstName} {poll.creator.lastName[0]}.</span>
        )}
      </div>
    </div>
  );
}
