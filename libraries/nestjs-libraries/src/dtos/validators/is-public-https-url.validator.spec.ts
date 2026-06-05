import {
  checkPublicHttpsUrl,
  isPublicHttpsUrl,
  IsPublicHttpsUrlConstraint,
} from './is-public-https-url.validator';

describe('isPublicHttpsUrl validator', () => {
  describe('checkPublicHttpsUrl', () => {
    it('deve aceitar uma url https publica', () => {
      expect(checkPublicHttpsUrl('https://blog.exemplo.com/receita-bolo')).toBeNull();
    });

    it('deve aceitar https com porta e querystring', () => {
      expect(
        checkPublicHttpsUrl('https://exemplo.com:8443/post?id=10&utm=ig')
      ).toBeNull();
    });

    it('deve rejeitar http (somente https permitido)', () => {
      expect(checkPublicHttpsUrl('http://exemplo.com')).not.toBeNull();
    });

    it('deve rejeitar esquema javascript', () => {
      expect(checkPublicHttpsUrl('javascript:alert(1)')).not.toBeNull();
    });

    it('deve rejeitar esquema data', () => {
      expect(checkPublicHttpsUrl('data:text/html,<script>1</script>')).not.toBeNull();
    });

    it('deve rejeitar esquema file', () => {
      expect(checkPublicHttpsUrl('file:///etc/passwd')).not.toBeNull();
    });

    it('deve rejeitar string que nao e url', () => {
      expect(checkPublicHttpsUrl('nao-eh-url')).not.toBeNull();
    });

    it('deve rejeitar localhost', () => {
      expect(checkPublicHttpsUrl('https://localhost/admin')).not.toBeNull();
    });

    it('deve rejeitar loopback 127.0.0.1', () => {
      expect(checkPublicHttpsUrl('https://127.0.0.1:6000')).not.toBeNull();
    });

    it('deve rejeitar rede privada 10.x', () => {
      expect(checkPublicHttpsUrl('https://10.1.2.3')).not.toBeNull();
    });

    it('deve rejeitar rede privada 192.168.x', () => {
      expect(checkPublicHttpsUrl('https://192.168.0.1')).not.toBeNull();
    });

    it('deve rejeitar rede privada 172.16-31.x', () => {
      expect(checkPublicHttpsUrl('https://172.20.0.5')).not.toBeNull();
    });

    it('deve rejeitar link-local 169.254.x', () => {
      expect(checkPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).not.toBeNull();
    });

    it('deve rejeitar 0.0.0.0', () => {
      expect(checkPublicHttpsUrl('https://0.0.0.0')).not.toBeNull();
    });

    it('deve rejeitar loopback IPv6 ::1', () => {
      expect(checkPublicHttpsUrl('https://[::1]:8443/x')).not.toBeNull();
    });

    it('deve rejeitar dominio .local', () => {
      expect(checkPublicHttpsUrl('https://servidor.local')).not.toBeNull();
    });

    it('deve rejeitar dominio .internal', () => {
      expect(checkPublicHttpsUrl('https://api.internal')).not.toBeNull();
    });

    it('deve rejeitar IP em decimal (2130706433 == 127.0.0.1)', () => {
      expect(checkPublicHttpsUrl('https://2130706433/x')).not.toBeNull();
    });

    it('deve rejeitar IP em hexadecimal (0x7f000001)', () => {
      expect(checkPublicHttpsUrl('https://0x7f000001')).not.toBeNull();
    });

    it('deve rejeitar IPv4-mapped IPv6 (::ffff:127.0.0.1)', () => {
      expect(checkPublicHttpsUrl('https://[::ffff:127.0.0.1]')).not.toBeNull();
    });
  });

  describe('isPublicHttpsUrl', () => {
    it('deve retornar true para url https publica', () => {
      expect(isPublicHttpsUrl('https://exemplo.com')).toBe(true);
    });

    it('deve retornar false para host privado', () => {
      expect(isPublicHttpsUrl('https://127.0.0.1')).toBe(false);
    });

    it('deve retornar false para valor nao-string', () => {
      expect(isPublicHttpsUrl(123 as any)).toBe(false);
    });
  });

  describe('IsPublicHttpsUrlConstraint', () => {
    const constraint = new IsPublicHttpsUrlConstraint();

    it('deve tratar undefined como valido (campo opcional)', () => {
      expect(constraint.validate(undefined)).toBe(true);
    });

    it('deve tratar string vazia como valido (campo opcional)', () => {
      expect(constraint.validate('')).toBe(true);
    });

    it('deve rejeitar url privada', () => {
      expect(constraint.validate('https://localhost')).toBe(false);
    });

    it('deve aceitar url publica', () => {
      expect(constraint.validate('https://exemplo.com')).toBe(true);
    });
  });
});
