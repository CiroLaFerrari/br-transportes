import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const list = await prisma.coleta.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nf: true,
      cidade: true,
      uf: true,
      valorFrete: true,
      pesoTotalKg: true,
      clienteId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ total: list.length, list });
}
