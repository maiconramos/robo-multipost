// Button attached to an Instagram DM. Two variants:
//   - 'url'      -> abre URL externa (Meta: type=web_url)
//   - 'postback' -> dispara webhook messaging_postbacks ao ser clicado
//                   (Meta: type=postback), usado pelo fluxo de follow-gate
//                   em 2 etapas para confirmar consentimento do usuario.
export type InstagramDmButton =
  | { kind: 'url'; title: string; url: string }
  | { kind: 'postback'; title: string; payload: string };
