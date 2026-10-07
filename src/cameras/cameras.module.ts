import { Module } from '@nestjs/common';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { EpiController } from './epi.controller';

@Module({ controllers: [CamerasController, EpiController], providers: [CamerasService], exports: [CamerasService] })
export class CamerasModule {}
