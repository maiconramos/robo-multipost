import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export const loadSwagger = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('Multipost API')
    .setDescription(
      'API pública do Robô MultiPost. ' +
        'Para testar os endpoints aqui, clique em **Authorize** e cole sua chave de API ' +
        '(Configurações > Integrações) — valor cru, **sem** "Bearer". ' +
        'Endpoints públicos ficam sob `/public/v1` (ex.: automações em `/public/v1/flows`).'
    )
    .setVersion('1.0')
    // Esquema de auth por chave de API (header Authorization). Habilita o botao
    // "Authorize" no Swagger UI para testar os endpoints publicos. O `name`
    // 'api-key' e referenciado por @ApiSecurity('api-key') nos controllers.
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description:
          'Chave de API da organizacao ou do perfil (Configuracoes > Integracoes). ' +
          'Cole o valor cru, sem o prefixo "Bearer".',
      },
      'api-key'
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
};
