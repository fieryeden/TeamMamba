"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ColumnField {
  id: string;
  title: string;
  columnType: string;
  config: unknown;
}

interface GroupOption {
  id: string;
  name: string;
}

export function PublicFormClient({
  boardId,
  boardName,
  columns,
  groups,
}: {
  boardId: string;
  boardName: string;
  columns: ColumnField[];
  groups: GroupOption[];
}) {
  const [itemName, setItemName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const formColumns = useMemo(
    () => columns.filter((column) => column.columnType !== "AUTO_NUMBER" && column.columnType !== "ITEM_ID"),
    [columns]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!itemName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/form/${boardId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: itemName.trim(),
          groupId: groupId || undefined,
          values,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setItemName("");
        setValues({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-mamba-700">Submission received</h1>
        <p className="text-sm text-muted-foreground">Your response was added to {boardName}.</p>
        <Button className="mt-4 bg-mamba-600 hover:bg-mamba-700" onClick={() => setSubmitted(false)}>
          Submit Another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold">Submit to {boardName}</h1>
        <p className="text-sm text-muted-foreground">Fill out the form to create a new item.</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Item Name</label>
        <Input value={itemName} onChange={(event) => setItemName(event.target.value)} required />
      </div>

      {groups.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm font-medium">Group</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {formColumns.map((column) => (
        <div key={column.id} className="space-y-1">
          <label className="text-sm font-medium">{column.title}</label>
          <FormField
            column={column}
            value={values[column.id]}
            onChange={(nextValue) => setValues((prev) => ({ ...prev, [column.id]: nextValue }))}
          />
        </div>
      ))}

      <Button type="submit" disabled={submitting} className="w-full bg-mamba-600 hover:bg-mamba-700">
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </form>
  );
}

function FormField({
  column,
  value,
  onChange,
}: {
  column: ColumnField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (column.columnType === "STATUS") {
    const config = (column.config as { labels?: string[] } | null)?.labels ?? [];
    return (
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={typeof value === "number" ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {config.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  if (column.columnType === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded"
        />
        Checked
      </label>
    );
  }

  if (column.columnType === "NUMBER" || column.columnType === "PROGRESS" || column.columnType === "RATING") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    );
  }

  if (column.columnType === "DATE") {
    return (
      <Input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
    );
  }

  if (column.columnType === "LONG_TEXT") {
    return (
      <textarea
        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      type={column.columnType === "EMAIL" ? "email" : "text"}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
