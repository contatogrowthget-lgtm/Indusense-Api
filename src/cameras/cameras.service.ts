import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'fs';
import { join, resolve } from 'path';
import { AuthUser } from '../common/decorators';
import { serializeCamera, serializeOcorrencia } from '../common/serializers';
import { cameraOnline, EPI_LABEL, whereIdOrCode } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CameraStatusDto, CreateCameraDto, CreateOcorrenciaDto, ListCamerasDto, ListOcorrenciasDto, UpdateCameraDto,
} from './dto/cameras.dto';

const COM_SALA = { sala: true } satisfies Prisma.CameraInclude;
const OCORRENCIA_INCLUDE = { camera: { include: { sala: true } } } satisfies Prisma.EpiOcorrenciaInclude;
const MAX_FOTO_BYTES = 4 * 1024 * 1024;

@Injectable()
export class CamerasService {
  private readonly log = new Logger('Fotos');
  private readonly uploadDir = resolve(process.env.EPI_UPLOAD_DIR || join(process.cwd(), 'uploads', 'epi'));

  // Com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, as fotos vão para o Storage do Supabase
  // (necessário em hospedagem na nuvem, onde a pasta local é apagada a cada reinício).
  private readonly sbUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  private readonly sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  private readonly sbBucket = process.env.SUPABASE_BUCKET || 'epi-fotos';
  private bucketPronto = false;

  constructor(private prisma: PrismaService) {
    if (this.usaSupabase) {
      this.log.log(`Fotos das ocorrências no Supabase Storage (bucket ${this.sbBucket}).`);
    } else if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private get usaSupabase() {
    return !!(this.sbUrl && this.sbKey);
  }

  private sbHeaders(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.sbKey}`, apikey: this.sbKey, ...extra };
  }

  private async garantirBucket() {
    if (this.bucketPronto) return;
    const res = await fetch(`${this.sbUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: this.sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: this.sbBucket, name: this.sbBucket, public: false }),
    });
    // 200 = criado; 400/409 = já existe
    if (res.ok || res.status === 400 || res.status === 409) this.bucketPronto = true;
    else this.log.warn(`Não foi possível criar o bucket: HTTP ${res.status} ${await res.text()}`);
  }

  private async gravarArquivo(nome: string, buf: Buffer) {
    if (!this.usaSupabase) {
      await fs.writeFile(join(this.uploadDir, nome), buf);
      return;
    }
    await this.garantirBucket();
    const res = await fetch(`${this.sbUrl}/storage/v1/object/${this.sbBucket}/${nome}`, {
      method: 'POST',
      headers: this.sbHeaders({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
      body: buf as any,
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`Falha ao salvar a foto no Supabase: HTTP ${res.status} ${await res.text()}`);
    }
  }

  private async lerArquivo(nome: string): Promise<Buffer | ReturnType<typeof createReadStream>> {
    if (!this.usaSupabase) {
      const caminho = join(this.uploadDir, nome);
      if (!existsSync(caminho)) throw new NotFoundException('Foto não encontrada.');
      return createReadStream(caminho);
    }
    const res = await fetch(`${this.sbUrl}/storage/v1/object/${this.sbBucket}/${nome}`, { headers: this.sbHeaders() });
    if (!res.ok) throw new NotFoundException('Foto não encontrada no Supabase Storage.');
    return Buffer.from(await res.arrayBuffer());
  }

  private async apagarArquivo(nome: string) {
    if (!this.usaSupabase) {
      await fs.unlink(join(this.uploadDir, nome)).catch(() => undefined);
      return;
    }
    await fetch(`${this.sbUrl}/storage/v1/object/${this.sbBucket}`, {
      method: 'DELETE',
      headers: this.sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [nome] }),
    }).catch(() => undefined);
  }

  // ------------------------------------------------------------ câmeras

  private async findCamera(idOrCode: string) {
    return this.prisma.camera.findFirst({ where: whereIdOrCode(idOrCode), include: COM_SALA });
  }

  private async cameraOr404(idOrCode: string) {
    const cam = await this.findCamera(idOrCode);
    if (!cam) throw new NotFoundException(`Câmera ${idOrCode} não cadastrada.`);
    return cam;
  }

  private async salaOr404(idOrCode: string) {
    const sala = await this.prisma.sala.findFirst({ where: whereIdOrCode(idOrCode), select: { id: true } });
    if (!sala) throw new NotFoundException('Sala não encontrada.');
    return sala;
  }

  async findAll(q: ListCamerasDto) {
    const sala = q.salaId ? await this.salaOr404(q.salaId) : null;
    const cams = await this.prisma.camera.findMany({
      where: { salaId: sala?.id },
      include: COM_SALA,
      orderBy: [{ salaId: 'asc' }, { nome: 'asc' }],
    });
    return cams.map(serializeCamera);
  }

  async findOne(id: string) {
    return serializeCamera(await this.cameraOr404(id));
  }

  async create(dto: CreateCameraDto) {
    const sala = await this.salaOr404(dto.salaId);
    const cam = await this.prisma.camera.create({
      data: {
        salaId: sala.id,
        nome: dto.nome.trim(),
        codigo: dto.codigo?.trim() || (await this.proximoCodigo()),
        streamUrl: dto.streamUrl?.trim() || null,
        online: false,
        pessoas: 0,
        epiConformidade: 0,
      },
      include: COM_SALA,
    });
    return serializeCamera(cam);
  }

  async update(id: string, dto: UpdateCameraDto) {
    const cam = await this.cameraOr404(id);
    const salaId = dto.salaId ? (await this.salaOr404(dto.salaId)).id : undefined;
    const atualizada = await this.prisma.camera.update({
      where: { id: cam.id },
      data: {
        salaId,
        nome: dto.nome?.trim(),
        codigo: dto.codigo?.trim(),
        streamUrl: dto.streamUrl === undefined ? undefined : dto.streamUrl.trim() || null,
        online: dto.online,
      },
      include: COM_SALA,
    });
    return serializeCamera(atualizada);
  }

  async remove(id: string) {
    const cam = await this.cameraOr404(id);
    await this.prisma.camera.delete({ where: { id: cam.id } });
    return { message: 'Câmera removida.' };
  }

  /** Batimento do sistema de câmera: atualiza pessoas, conformidade e ocorrência atual. */
  async reportStatus(id: string, dto: CameraStatusDto) {
    let cam = await this.findCamera(id);
    if (!cam) {
      if (!dto.salaId) {
        throw new NotFoundException(
          `Câmera ${id} não cadastrada. Cadastre em POST /cameras ou envie salaId para criar automaticamente.`,
        );
      }
      const sala = await this.salaOr404(dto.salaId);
      cam = await this.prisma.camera.create({
        data: { salaId: sala.id, codigo: id, nome: dto.nome?.trim() || id, online: false },
        include: COM_SALA,
      });
    }

    const atualizada = await this.prisma.camera.update({
      where: { id: cam.id },
      data: {
        online: dto.online,
        pessoas: dto.online ? dto.pessoas : 0,
        epiConformidade: dto.online ? dto.epiConformidade : 0,
        ocorrencia: dto.online ? dto.ocorrencia ?? null : 'Câmera sem sinal',
        streamUrl: dto.streamUrl?.trim() || undefined,
        ultimoContato: new Date(),
      },
      include: COM_SALA,
    });
    return serializeCamera(atualizada);
  }

  private async proximoCodigo() {
    let n = (await this.prisma.camera.count()) + 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const codigo = `CAM-${String(n).padStart(2, '0')}`;
      if (!(await this.prisma.camera.findUnique({ where: { codigo } }))) return codigo;
      n++;
    }
  }

  // ------------------------------------------------------- ocorrências

  async createOcorrencia(cameraId: string, dto: CreateOcorrenciaDto) {
    const cam = await this.cameraOr404(cameraId);
    const faltando = [...new Set(dto.faltando.map((f) => f.trim().toLowerCase()).filter(Boolean))];
    const desconhecidos = faltando.filter((f) => !EPI_LABEL[f]);
    if (desconhecidos.length) {
      throw new BadRequestException(`EPI desconhecido: ${desconhecidos.join(', ')}.`);
    }

    if (dto.origemId) {
      const existente = await this.prisma.epiOcorrencia.findUnique({
        where: { cameraId_origemId: { cameraId: cam.id, origemId: dto.origemId } },
        include: OCORRENCIA_INCLUDE,
      });
      if (existente) return serializeOcorrencia(existente); // reenvio: não duplica
    }

    const foto = dto.foto ? await this.salvarFoto(dto.foto) : null;
    try {
      const o = await this.prisma.epiOcorrencia.create({
        data: {
          cameraId: cam.id,
          origemId: dto.origemId || null,
          pessoa: dto.pessoa,
          faltando,
          foto,
          dataHora: dto.dataHora ? new Date(dto.dataHora) : undefined,
        },
        include: OCORRENCIA_INCLUDE,
      });
      return serializeOcorrencia(o);
    } catch (e) {
      if (foto) await this.apagarArquivo(foto);
      throw e;
    }
  }

  private async salvarFoto(base64: string) {
    const limpo = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
    const buf = Buffer.from(limpo, 'base64');
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      throw new BadRequestException('A foto deve ser um JPEG em base64.');
    }
    if (buf.length > MAX_FOTO_BYTES) throw new BadRequestException('Foto maior que 4 MB.');
    const nome = `${randomUUID()}.jpg`;
    await this.gravarArquivo(nome, buf);
    return nome;
  }

  private async filtroOcorrencias(q: ListOcorrenciasDto): Promise<Prisma.EpiOcorrenciaWhereInput | null> {
    const sala = q.salaId ? await this.prisma.sala.findFirst({ where: whereIdOrCode(q.salaId), select: { id: true } }) : null;
    const cam = q.cameraId ? await this.prisma.camera.findFirst({ where: whereIdOrCode(q.cameraId), select: { id: true } }) : null;
    if ((q.salaId && !sala) || (q.cameraId && !cam)) return null;
    return {
      resolvido: q.resolvido,
      lido: q.lido,
      cameraId: cam?.id,
      camera: sala ? { salaId: sala.id } : undefined,
      dataHora: q.inicio || q.fim
        ? { gte: q.inicio ? new Date(q.inicio) : undefined, lte: q.fim ? new Date(q.fim) : undefined }
        : undefined,
    };
  }

  async listOcorrencias(q: ListOcorrenciasDto) {
    const where = await this.filtroOcorrencias(q);
    if (!where) return [];
    const lista = await this.prisma.epiOcorrencia.findMany({
      where,
      include: OCORRENCIA_INCLUDE,
      orderBy: { dataHora: 'desc' },
      take: q.limit ?? 100,
    });
    return lista.map(serializeOcorrencia);
  }

  async resumo() {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const [hoje, abertas, naoLidas, cameras] = await Promise.all([
      this.prisma.epiOcorrencia.count({ where: { dataHora: { gte: inicioDia } } }),
      this.prisma.epiOcorrencia.count({ where: { resolvido: false } }),
      this.prisma.epiOcorrencia.count({ where: { lido: false } }),
      this.prisma.camera.findMany(),
    ]);
    const on = cameras.filter(cameraOnline);
    return {
      ocorrenciasHoje: hoje,
      abertas,
      naoLidas,
      camerasTotal: cameras.length,
      camerasOnline: on.length,
      pessoasDetectadas: on.reduce((a, c) => a + c.pessoas, 0),
      conformidadeMedia: on.length ? Math.round(on.reduce((a, c) => a + c.epiConformidade, 0) / on.length) : null,
    };
  }

  private async ocorrenciaOr404(id: string) {
    const o = await this.prisma.epiOcorrencia.findUnique({ where: { id }, include: OCORRENCIA_INCLUDE });
    if (!o) throw new NotFoundException('Ocorrência não encontrada.');
    return o;
  }

  async findOcorrencia(id: string) {
    return serializeOcorrencia(await this.ocorrenciaOr404(id));
  }

  async foto(id: string) {
    const o = await this.ocorrenciaOr404(id);
    if (!o.foto) throw new NotFoundException('Esta ocorrência não tem foto.');
    return this.lerArquivo(o.foto);
  }

  async marcarLida(id: string) {
    await this.ocorrenciaOr404(id);
    const o = await this.prisma.epiOcorrencia.update({
      where: { id }, data: { lido: true, lidoEm: new Date() }, include: OCORRENCIA_INCLUDE,
    });
    return serializeOcorrencia(o);
  }

  async marcarTodasLidas() {
    const r = await this.prisma.epiOcorrencia.updateMany({ where: { lido: false }, data: { lido: true, lidoEm: new Date() } });
    return { atualizados: r.count };
  }

  async resolver(id: string, user: AuthUser) {
    await this.ocorrenciaOr404(id);
    const agora = new Date();
    const o = await this.prisma.epiOcorrencia.update({
      where: { id },
      data: { resolvido: true, resolvidoEm: agora, resolvidoPorId: user?.id ?? null, lido: true, lidoEm: agora },
      include: OCORRENCIA_INCLUDE,
    });
    return serializeOcorrencia(o);
  }
}
