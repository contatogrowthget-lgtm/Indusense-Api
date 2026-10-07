import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { CamerasModule } from './cameras/cameras.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { ReadingsModule } from './readings/readings.module';
import { SalasModule } from './salas/salas.module';
import { SensorsModule } from './sensors/sensors.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env: Record<string, any>) => {
        if (!env.DATABASE_URL) throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
        if (!env.JWT_SECRET || String(env.JWT_SECRET).length < 16) {
          throw new Error('JWT_SECRET ausente ou curto demais (mínimo 16 caracteres).');
        }
        return env;
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    SalasModule,
    SensorsModule,
    ReadingsModule,
    AlertsModule,
    CamerasModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
