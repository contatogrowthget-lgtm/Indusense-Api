import { Module } from '@nestjs/common';
import { ReadingsModule } from '../readings/readings.module';
import { SalasController } from './salas.controller';
import { SalasService } from './salas.service';

@Module({ imports: [ReadingsModule], controllers: [SalasController], providers: [SalasService] })
export class SalasModule {}
