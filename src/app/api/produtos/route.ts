import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcAreaM2(largCm: number | null, compCm: number | null) {
  if (!largCm || !compCm) return null;
  // cm -> m
  const largM = largCm / 100;
  const compM = compCm / 100;
  const area = largM * compM;
  return Number.isFinite(area) ? area : null;
}

function calcVolumeM3(altCm: number | null, largCm: number | null, compCm: number | null) {
  if (!altCm || !largCm || !compCm) return null;
  const altM = altCm / 100;
  const largM = largCm / 100;
  const compM = compCm / 100;
  const vol = altM * largM * compM;
  return Number.isFinite(vol) ? vol : null;
}

function normTipoCodigo(raw: any) {
  const t = String(raw || '').trim().toUpperCase();
  return t === 'INTERNO' ? 'INTERNO' : 'FORNECEDOR';
}

async function gerarCodigoInternoSequencial(tx: typeof prisma) {
  // Formato: INT-000001
  // Busca os que começam com INT- e pega o maior sufixo numérico
  const last = await tx.produto.findFirst({
    where: { code: { startsWith: 'INT-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  let next = 1;
  if (last?.code) {
    const m = last.code.match(/^INT-(\d+)$/);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) next = n + 1;
    }
  }

  const pad = String(next).padStart(6, '0');
  return `INT-${pad}`;
}

function nextCompCode(existingCodes: string[]) {
  // Gera C001, C002... baseado no maior número existente no padrão Cddd
  let max = 0;
  for (const c of existingCodes) {
    const m = String(c || '').toUpperCase().match(/^C(\d{1,6})$/);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  const next = max + 1;
  return `C${String(next).padStart(3, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = (url.searchParams.get('search') || '').trim();
    const takeRaw = url.searchParams.get('take') || '50';
    let take = Number(takeRaw);
    if (!Number.isFinite(take) || take <= 0) take = 50;
    take = Math.min(take, 200);

    const where = search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' as const } },
            { descricao: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const items = await prisma.produto.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        code: true,
        tipoCodigo: true,
        descricao: true,
        precoUnitario: true,
        pesoKg: true,
        comprimentoCm: true,
        larguraCm: true,
        alturaCm: true,
        areaM2: true,
        volumeM3: true,
        embalado: true,
        tipoEmbalagem: true,
        fragil: true,
        empilhavel: true,
        posicao: true,
        desmontavel: true,
        updatedAt: true,
        createdAt: true,
      } as any,
    });

    return json({ ok: true, items, take, search: search || null });
  } catch (e: any) {
    console.error('GET /api/produtos error:', e);
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: 'JSON inválido.' }, 400);

    const tipoCodigo = normTipoCodigo(body.tipoCodigo);
    let code = String(body.code || '').trim();
    const descricao = String(body.descricao || '').trim();

    if (!descricao) return json({ ok: false, error: 'Campo "descricao" é obrigatório.' }, 400);

    const precoUnitario = toNum(body.precoUnitario);
    const pesoKg = toNum(body.pesoKg);
    const compCm = toNum(body.comprimentoCm);
    const largCm = toNum(body.larguraCm);
    const altCm = toNum(body.alturaCm);

    const areaM2 = calcAreaM2(largCm, compCm);
    const volumeM3 = calcVolumeM3(altCm, largCm, compCm);

    const embalado = !!body.embalado;
    const tipoEmbalagemRaw = body.tipoEmbalagem ? String(body.tipoEmbalagem).trim().toUpperCase() : null;
    const tipoEmbalagem = tipoEmbalagemRaw && ['CAIXA_MADEIRA', 'CAIXA_PAPELAO', 'AMARRADO', 'OUTROS'].includes(tipoEmbalagemRaw) ? tipoEmbalagemRaw : null;
    const fragil = !!body.fragil;
    const empilhavel = body.empilhavel === false ? false : true;
    const posicaoRaw = body.posicao ? String(body.posicao).trim().toUpperCase() : null;
    const posicao = posicaoRaw && ['FRONTAL', 'INDIFERENTE'].includes(posicaoRaw) ? posicaoRaw : null;
    const desmontavel = !!body.desmontavel;

    const componentesIn = Array.isArray(body.componentes) ? body.componentes : [];

    const result = await prisma.$transaction(async (tx) => {
      if (tipoCodigo === 'INTERNO' && !code) {
        code = await gerarCodigoInternoSequencial(tx as any);
      }

      if (!code) return { ok: false as const, status: 400, error: 'Campo "code" é obrigatório (ou tipoCodigo=INTERNO para gerar automático).' };

      // cria produto
      const created = await tx.produto.create({
        data: {
          code,
          tipoCodigo: tipoCodigo as any,
          descricao,
          precoUnitario: precoUnitario ?? undefined,
          pesoKg: pesoKg ?? undefined,
          comprimentoCm: compCm ?? undefined,
          larguraCm: largCm ?? undefined,
          alturaCm: altCm ?? undefined,
          areaM2: areaM2 ?? undefined,
          volumeM3: volumeM3 ?? undefined,
          embalado,
          tipoEmbalagem: tipoEmbalagem ?? undefined,
          fragil,
          empilhavel,
          posicao: posicao ?? undefined,
          desmontavel,
        } as any,
        select: { id: true, code: true } as any,
      });

      // cria componentes (opcional)
      const existingCodes: string[] = [];
      const compCreates: any[] = [];

      for (const c of componentesIn) {
        const codigoRaw = String(c?.codigo || '').trim().toUpperCase();
        const codigo = codigoRaw || nextCompCode(existingCodes);

        existingCodes.push(codigo);

        const nome = String(c?.nome || c?.descricao || '').trim();
        if (!nome) continue; // ignora componente sem descrição

        const cpeso = toNum(c?.pesoKg);
        const ccomp = toNum(c?.comprimentoCm);
        const clarg = toNum(c?.larguraCm);
        const calt = toNum(c?.alturaCm);

        const carea = calcAreaM2(clarg, ccomp);
        const cvol = calcVolumeM3(calt, clarg, ccomp);

        const quantidade = Number.isFinite(Number(c?.quantidade)) ? Math.max(1, Number(c.quantidade)) : 1;
        const observacao = c?.observacao ? String(c.observacao).slice(0, 500) : null;

        compCreates.push({
          produtoId: created.id,
          codigo,
          nome,
          pesoKg: cpeso ?? undefined,
          comprimentoCm: ccomp ?? undefined,
          larguraCm: clarg ?? undefined,
          alturaCm: calt ?? undefined,
          areaM2: carea ?? undefined,
          volumeM3: cvol ?? undefined,
          quantidade,
          observacao: observacao ?? undefined,
        });
      }

      if (compCreates.length > 0) {
        await tx.componente.createMany({ data: compCreates as any });
      }

      const full = await tx.produto.findUnique({
        where: { id: created.id },
        include: { componentes: { orderBy: { codigo: 'asc' } } } as any,
      });

      return { ok: true as const, produto: full };
    });

    if ((result as any)?.ok === false && (result as any)?.status) {
      return json(result, (result as any).status);
    }

    return json(result, 201);
  } catch (e: any) {
    console.error('POST /api/produtos error:', e);
    const msg = String(e?.message || 'Erro interno.');
    // erro de unique (code)
    if (msg.toLowerCase().includes('unique')) {
      return json({ ok: false, error: 'Código já existe (campo code precisa ser único).' }, 409);
    }
    return json({ ok: false, error: msg }, 500);
  }
}
