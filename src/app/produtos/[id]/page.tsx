'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import ProdutoEditor from '@/components/ProdutoEditor';

export default function EditarProdutoPage() {
  const params = useParams<{ id: string }>();
  const id = (params?.id || '').toString();
  return <ProdutoEditor mode="edit" produtoId={id} />;
}
