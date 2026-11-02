import { isNotSecured } from '@gitroom/helpers/utils/not.secured';

describe('isNotSecured (NOT_SECURED)', () => {
  it.each(['false', 'FALSE', '0', 'no', '', '  ', undefined])(
    '%p mantem o modo seguro (cookie HttpOnly/Secure)',
    (value) => {
      expect(isNotSecured(value as string | undefined)).toBe(false);
    }
  );

  it.each(['true', 'TRUE', '1', 'yes', ' on '])('%p liga o modo sem HTTPS', (value) => {
    expect(isNotSecured(value)).toBe(true);
  });
});
