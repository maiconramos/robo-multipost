export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  uploadFile(file: Express.Multer.File): Promise<any>;
  removeFile(filePath: string): Promise<void>;
  // Sonda de liveness do storage (aba Status > Saúde da infra): lança em falha
  // (credencial errada / bucket inacessível / diretório não gravável). Deve
  // validar o acesso SEM escrever um arquivo de verdade.
  healthCheck(): Promise<void>;
}
