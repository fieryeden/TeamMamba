import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicFormClient } from "@/components/boards/public-form-client";

export default async function BoardFormPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      name: true,
      columns: { orderBy: { order: "asc" }, select: { id: true, title: true, columnType: true, config: true } },
      groups: { orderBy: { position: "asc" }, select: { id: true, name: true } },
    },
  });

  if (!board) return notFound();

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <PublicFormClient
        boardId={board.id}
        boardName={board.name}
        columns={board.columns}
        groups={board.groups}
      />
    </div>
  );
}
