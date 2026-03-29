import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

// POST /api/rotas/:id/assign  body: { driverId?, vehicleId? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    const driverId = b.driverId ? String(b.driverId) : undefined;
    const vehicleId = b.vehicleId ? String(b.vehicleId) : undefined;

    const rota = await prisma.rota.findUnique({ where: { id } });
    if (!rota) return NextResponse.json({ error: 'Rota não encontrada' }, { status: 404 });

    const data: any = {};
    if (driverId) {
      const d = await prisma.motorista.findUnique({ where: { id: driverId } });
      if (!d) return NextResponse.json({ error: 'Motorista inválido' }, { status: 400 });
      data.motoristaId = driverId;
    }
    if (vehicleId) {
      const v = await prisma.veiculo.findUnique({ where: { id: vehicleId } });
      if (!v) return NextResponse.json({ error: 'Veículo inválido' }, { status: 400 });
      data.veiculoId = vehicleId;
    }

    if ((driverId || vehicleId) && rota.status === 'PLANEJADA') data.status = 'ATRIBUIDA';

    const updated = await prisma.rota.update({
      where: { id: rota.id },
      data,
      include: {
        paradas: { orderBy: { ordem: 'asc' } },
        motorista: true,
        veiculo: true,
      },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('POST /api/rotas/[id]/assign error:', e);
    return NextResponse.json({ error: 'Erro ao atribuir rota' }, { status: 500 });
  }
}
