import { WalletProvider } from './wallet.provider';

describe('WalletProvider.getUser', () => {
  it('assinatura invalida nao devolve identidade (nem id vazio)', async () => {
    const provider = new WalletProvider();
    jest.spyOn(provider, 'getToken').mockResolvedValue('');

    await expect(provider.getUser('qualquer')).resolves.toBe(false);
  });

  it('assinatura valida devolve o id da carteira', async () => {
    const provider = new WalletProvider();
    jest.spyOn(provider, 'getToken').mockResolvedValue('ok');
    const token = Buffer.from(JSON.stringify({ publicKey: 'ABC123' })).toString('base64');

    await expect(provider.getUser(token)).resolves.toEqual({
      id: 'wallet_ABC123',
      email: 'wallet_ABC123',
    });
  });
});
