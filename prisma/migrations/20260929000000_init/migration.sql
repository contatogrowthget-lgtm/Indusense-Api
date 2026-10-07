-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'OPERADOR', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "SensorTipo" AS ENUM ('temperatura', 'umidade', 'qualidade_ar', 'gas');

-- CreateEnum
CREATE TYPE "SensorStatus" AS ENUM ('normal', 'atencao', 'critico', 'offline');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "cargo" TEXT,
    "empresa" TEXT,
    "perfil" "Perfil" NOT NULL DEFAULT 'VISUALIZADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "salas" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "localizacao" TEXT,
    "nfcTagId" TEXT NOT NULL,
    "dispositivoModelo" TEXT NOT NULL DEFAULT 'ESP32 DevKit',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" UUID NOT NULL,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" "SensorTipo" NOT NULL,
    "salaId" UUID NOT NULL,
    "limiteMin" DOUBLE PRECISION NOT NULL,
    "limiteMax" DOUBLE PRECISION NOT NULL,
    "valorAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SensorStatus" NOT NULL DEFAULT 'offline',
    "ultimaLeitura" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readings" (
    "id" UUID NOT NULL,
    "sensorId" UUID NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "SensorStatus" NOT NULL DEFAULT 'normal',
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "sensorId" UUID NOT NULL,
    "tipo" "SensorTipo" NOT NULL,
    "valorMedido" DOUBLE PRECISION NOT NULL,
    "limite" DOUBLE PRECISION NOT NULL,
    "severidade" "SensorStatus" NOT NULL,
    "mensagem" TEXT,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "lidoEm" TIMESTAMP(3),
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPorId" UUID,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cameras" (
    "id" UUID NOT NULL,
    "salaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "pessoas" INTEGER NOT NULL DEFAULT 0,
    "epiConformidade" INTEGER NOT NULL DEFAULT 100,
    "ocorrencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_perfil_idx" ON "users"("perfil");

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "salas_codigo_key" ON "salas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "salas_nfcTagId_key" ON "salas"("nfcTagId");

-- CreateIndex
CREATE INDEX "salas_setor_idx" ON "salas"("setor");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_codigo_key" ON "sensors"("codigo");

-- CreateIndex
CREATE INDEX "sensors_salaId_idx" ON "sensors"("salaId");

-- CreateIndex
CREATE INDEX "sensors_tipo_idx" ON "sensors"("tipo");

-- CreateIndex
CREATE INDEX "sensors_status_idx" ON "sensors"("status");

-- CreateIndex
CREATE INDEX "readings_sensorId_dataHora_idx" ON "readings"("sensorId", "dataHora" DESC);

-- CreateIndex
CREATE INDEX "readings_dataHora_idx" ON "readings"("dataHora");

-- CreateIndex
CREATE INDEX "alerts_sensorId_dataHora_idx" ON "alerts"("sensorId", "dataHora" DESC);

-- CreateIndex
CREATE INDEX "alerts_lido_dataHora_idx" ON "alerts"("lido", "dataHora" DESC);

-- CreateIndex
CREATE INDEX "alerts_resolvido_idx" ON "alerts"("resolvido");

-- CreateIndex
CREATE INDEX "cameras_salaId_idx" ON "cameras"("salaId");

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "salas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "salas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
