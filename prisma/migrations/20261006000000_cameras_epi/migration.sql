-- AlterTable
ALTER TABLE "cameras" ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "streamUrl" TEXT,
ADD COLUMN     "ultimoContato" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "epi_ocorrencias" (
    "id" UUID NOT NULL,
    "cameraId" UUID NOT NULL,
    "origemId" TEXT,
    "pessoa" INTEGER NOT NULL,
    "faltando" TEXT[],
    "foto" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "lidoEm" TIMESTAMP(3),
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPorId" UUID,

    CONSTRAINT "epi_ocorrencias_pkey" PRIMARY KEY ("id")
);

-- Câmeras já cadastradas pelo seed ("CAM-01 • Entrada") ganham o código do nome
UPDATE "cameras" SET "codigo" = substring("nome" from '^(CAM-[0-9]+)') WHERE "nome" ~ '^CAM-[0-9]+';

-- CreateIndex
CREATE UNIQUE INDEX "cameras_codigo_key" ON "cameras"("codigo");

-- CreateIndex
CREATE INDEX "epi_ocorrencias_cameraId_dataHora_idx" ON "epi_ocorrencias"("cameraId", "dataHora" DESC);

-- CreateIndex
CREATE INDEX "epi_ocorrencias_resolvido_idx" ON "epi_ocorrencias"("resolvido");

-- CreateIndex
CREATE INDEX "epi_ocorrencias_dataHora_idx" ON "epi_ocorrencias"("dataHora");

-- CreateIndex
CREATE UNIQUE INDEX "epi_ocorrencias_cameraId_origemId_key" ON "epi_ocorrencias"("cameraId", "origemId");

-- AddForeignKey
ALTER TABLE "epi_ocorrencias" ADD CONSTRAINT "epi_ocorrencias_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epi_ocorrencias" ADD CONSTRAINT "epi_ocorrencias_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
