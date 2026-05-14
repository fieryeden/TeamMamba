import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await prisma.guestAccess.findUnique({
    where: { token },
    include: {
      board: {
        include: {
          columns: { orderBy: { order: "asc" } },
          groups: {
            orderBy: { position: "asc" },
            include: {
              items: {
                orderBy: { position: "asc" },
                include: {
                  columnValues: { include: { column: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!access) return notFound();
  if (access.expiresAt && access.expiresAt < new Date()) return notFound();

  return (
    <div className="min-h-screen bg-muted/20 p-6">
      <div className="mx-auto max-w-6xl rounded-lg border bg-card p-4">
        <h1 className="mb-4 text-2xl font-semibold">{access.board.name}</h1>
        <p className="mb-4 text-sm text-muted-foreground">Read-only shared board</p>
        <div className="overflow-auto">
          <table className="board-table w-full">
            <thead>
              <tr>
                <th className="min-w-[220px]">Item</th>
                {access.board.columns.map((column) => (
                  <th key={column.id}>{column.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {access.board.groups.map((group) => (
                <tr key={group.id}>
                  <td colSpan={access.board.columns.length + 1} className="bg-muted/40 px-3 py-2 text-sm font-semibold">
                    {group.name}
                  </td>
                </tr>
              ))}
              {access.board.groups.flatMap((group) =>
                group.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-sm">{item.name}</td>
                    {access.board.columns.map((column) => {
                      const value = item.columnValues.find((entry) => entry.column.id === column.id)?.value;
                      return (
                        <td key={`${item.id}-${column.id}`} className="px-3 py-2 text-xs">
                          {typeof value === "string"
                            ? value
                            : typeof value === "number"
                              ? String(value)
                              : value
                                ? JSON.stringify(value)
                                : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
