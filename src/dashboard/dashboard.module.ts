import { Module } from '@nestjs/common';
import { CamerasModule } from '../cameras/cameras.module';
import { ReadingsModule } from '../readings/readings.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [ReadingsModule, CamerasModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
