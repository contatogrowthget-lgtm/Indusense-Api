-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatar" TEXT;

-- CreateTable
CREATE TABLE "sessoes" (
    "jti" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "dispositivo" TEXT,
    "ip" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "sessoes_userId_revogada_idx" ON "sessoes"("userId", "revogada");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
