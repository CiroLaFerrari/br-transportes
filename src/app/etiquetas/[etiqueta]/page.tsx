import EtiquetaClient from './EtiquetaClient';

type PageProps = {
  params: Promise<{ etiqueta: string }>;
};

export default async function EtiquetaPage({ params }: PageProps) {
  const { etiqueta } = await params;

  return (
    <EtiquetaClient etiquetaParam={decodeURIComponent(etiqueta)} />
  );
}
