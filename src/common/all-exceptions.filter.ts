import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Formato de erro: { statusCode, message (SEMPRE string), errors?, path, timestamp }.
 * O ApiClient do Flutter lê `message` como string, então arrays de validação são unidos.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse();
    const req = http.getRequest();

    let status = 500;
    let message = 'Erro interno do servidor.';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') message = r;
      else {
        const m = (r as any).message;
        if (Array.isArray(m)) { errors = m; message = m.join(' '); }
        else if (m) message = String(m);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const alvo = (exception.meta as any)?.target;
          status = 409;
          message = `Já existe um registro com o mesmo valor${alvo ? ` (${Array.isArray(alvo) ? alvo.join(', ') : alvo})` : ''}.`;
          break;
        }
        case 'P2025': status = 404; message = 'Registro não encontrado.'; break;
        case 'P2003': status = 400; message = 'Referência inválida: o registro relacionado não existe.'; break;
        case 'P2023': status = 400; message = 'Identificador inválido.'; break;
        default: this.logger.error(exception.message, exception.stack);
      }
    } else {
      this.logger.error(String((exception as any)?.message ?? exception), (exception as any)?.stack);
    }

    res.status(status).json({ statusCode: status, message, errors, path: req.url, timestamp: new Date().toISOString() });
  }
}
