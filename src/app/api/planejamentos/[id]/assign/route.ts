import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Body esperado (IDs string)
type AssignBody = {
  driverId: string;
  vehicleId: string;
  // janela planejada (ISO) para checar conflito
  planStartAt: string; // ISO
  planEndAt: string;   // ISO
};

const ACTIVE_ROUTE_STATUSES = ["ATRIBUIDA", "EM_ROTA"] as const;
type ActiveRouteStatus = (typeof ACTIVE_ROUTE_STATUSES)[number];

function isIsoDate(s: string) {
  return !Number.isNaN(Date.parse(s));
}

function overlapWhere(planStartAt: Date, planEndAt: Date) {
  // Overlap: A.start < B.end && A.end > B.start
  return {
    planStartAt: { lt: planEndAt },
    planEndAt: { gt: planStartAt },
  };
}

// Tenta extrair itens (peso/volume) de um PlanStore com mesmo id (fallback simples)
async function getTotalsFromPlanStore(routePlanId: string) {
  try {
    const store = await prisma.planStore.findUnique({
      where: { id: routePlanId },
      select: { payload: true },
    });
    if (!store?.payload) return { totalPesoKg: 0, totalVolumeM3: 0, found: false };

    const payload: any = store.payload;
    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    let totalPesoKg = 0;
    let totalVolumeM3 = 0;
    for (const it of items) {
      if (typeof it?.pesoKg === "number") totalPesoKg += it.pesoKg;
      if (typeof it?.volumeM3 === "number") totalVolumeM3 += it.volumeM3;
    }
    return { totalPesoKg, totalVolumeM3, found: items.length > 0 };
  } catch {
    return { totalPesoKg: 0, totalVolumeM3: 0, found: false };
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // 👈 params é Promise
) {
  try {
    const { id } = await ctx.params; // 👈 precisa await
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = (await req.json()) as AssignBody;
    if (
      !body ||
      typeof body.driverId !== "string" ||
      typeof body.vehicleId !== "string" ||
      typeof body.planStartAt !== "string" ||
      typeof body.planEndAt !== "string" ||
      !isIsoDate(body.planStartAt) ||
      !isIsoDate(body.planEndAt)
    ) {
      return NextResponse.json(
        {
          error:
            "Payload inválido. Use { driverId, vehicleId, planStartAt(ISO), planEndAt(ISO) } com IDs string.",
        },
        { status: 400 }
      );
    }

    const planStartAt = new Date(body.planStartAt);
    const planEndAt = new Date(body.planEndAt);
    if (planStartAt >= planEndAt) {
      return NextResponse.json(
        { error: "planStartAt deve ser anterior a planEndAt" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Carrega o RoutePlan
      const route = await tx.routePlan.findUnique({
        where: { id },
        include: {
          driver: true,
          vehicle: true,
        },
      });
      if (!route) {
        throw new Error("RoutePlan não encontrado");
      }

      // Regras de status: pode atribuir em PLANEJADA ou reatribuir se ATRIBUIDA
      if (!["PLANEJADA", "ATRIBUIDA"].includes(route.status)) {
        throw new Error(
          `Não é possível atribuir neste status: ${route.status}. Permitidos: PLANEJADA ou ATRIBUIDA.`
        );
      }

      // 1) Conflito de agenda — DRIVER (ATRIBUIDA/EM_ROTA)
      const driverConflict = await tx.routePlan.findFirst({
        where: {
          id: { not: route.id },
          driverId: body.driverId,
          status: { in: ACTIVE_ROUTE_STATUSES as unknown as ActiveRouteStatus[] },
          ...overlapWhere(planStartAt, planEndAt),
        },
        select: { id: true, planStartAt: true, planEndAt: true, status: true },
      });
      if (driverConflict) {
        throw new Error(
          `Conflito de agenda do motorista com o planejamento ${driverConflict.id}.`
        );
      }

      // 2) Conflito de agenda — VEHICLE (ATRIBUIDA/EM_ROTA)
      const vehicleConflict = await tx.routePlan.findFirst({
        where: {
          id: { not: route.id },
          vehicleId: body.vehicleId,
          status: { in: ACTIVE_ROUTE_STATUSES as unknown as ActiveRouteStatus[] },
          ...overlapWhere(planStartAt, planEndAt),
        },
        select: { id: true, planStartAt: true, planEndAt: true, status: true },
      });
      if (vehicleConflict) {
        throw new Error(
          `Conflito de agenda do veículo com o planejamento ${vehicleConflict.id}.`
        );
      }

      // 3) Checagem de capacidade (se dados existirem)
      const veic = await tx.vehicle.findUnique({
        where: { id: body.vehicleId },
        select: { id: true, plate: true, capacityKg: true, capacityM3: true },
      });
      if (!veic) {
        throw new Error("Veículo não encontrado");
      }

      const { totalPesoKg, totalVolumeM3, found } = await getTotalsFromPlanStore(id);

      if (found) {
        if (
          typeof veic.capacityKg === "number" &&
          totalPesoKg > veic.capacityKg
        ) {
          throw new Error(
            `Capacidade excedida (peso). Planejado ${totalPesoKg.toFixed(2)} kg > capacidade ${veic.capacityKg.toFixed(2)} kg.`
          );
        }
        if (
          typeof veic.capacityM3 === "number" &&
          totalVolumeM3 > veic.capacityM3
        ) {
          throw new Error(
            `Capacidade excedida (volume). Planejado ${totalVolumeM3.toFixed(3)} m³ > capacidade ${veic.capacityM3.toFixed(3)} m³.`
          );
        }
      }

      // 4) Atualiza o RoutePlan: define alocação + janela planejada + status ATRIBUIDA
      const updated = await tx.routePlan.update({
        where: { id: route.id },
        data: {
          driverId: body.driverId,
          vehicleId: body.vehicleId,
          planStartAt,
          planEndAt,
          status: "ATRIBUIDA",
        },
        include: {
          driver: true,
          vehicle: true,
        },
      });

      return {
        ok: true,
        routePlan: {
          id: updated.id,
          status: updated.status,
          planStartAt: updated.planStartAt,
          planEndAt: updated.planEndAt,
          driver: updated.driver ? { id: updated.driver.id, name: updated.driver.name } : null,
          vehicle: updated.vehicle ? { id: updated.vehicle.id, plate: updated.vehicle.plate } : null,
          totals: found
            ? { totalPesoKg, totalVolumeM3 }
            : { note: "Sem dados de peso/volume no PlanStore.payload.items" },
        },
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    const message = err?.message ?? "Erro ao atribuir motorista/veículo";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
