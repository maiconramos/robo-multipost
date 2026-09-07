export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  uploadFile(file: Express.Multer.File): Promise<any>;
  /**
   * Remove do storage o arquivo apontado por `publicPath` — o mesmo valor
   * gravado em `Media.path`/`Media.thumbnail` (URL pública servida ao browser),
   * NÃO um caminho de disco. Cada provider traduz a URL para a sua chave.
   *
   * Contrato:
   * - idempotente: arquivo já removido resolve sem erro;
   * - no-op silencioso quando a URL não pertence a este storage (import
   *   externo, CDN de terceiro) — nunca chuta uma chave;
   * - lança em falha real (credencial, IO), para o chamador NÃO marcar a
   *   mídia como apagada e o usuário poder tentar de novo.
   */
  removeFile(publicPath: string): Promise<void>;
  // Sonda de liveness do storage (aba Status > Saúde da infra): lança em falha
  // (credencial errada / bucket inacessível / diretório não gravável). Deve
  // validar o acesso SEM escrever um arquivo de verdade.
  healthCheck(): Promise<void>;
}
