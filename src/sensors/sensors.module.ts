import { Module } from '@nestjs/common';
import { ReadingsModule } from '../readings/readings.module';
import { SensorsController } from './sensors.controller';
import { SensorsService } from './sensors.service';

@Module({ imports: [ReadingsModule], controllers: [SensorsController], providers: [SensorsService] })
export class SensorsModule {}
