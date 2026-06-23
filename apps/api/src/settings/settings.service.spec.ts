import {
  SettingsService,
  BRAND_HUE_KEY,
  DEFAULT_BRAND_HUE,
} from './settings.service';

const makePrisma = () => {
  const tx = {
    appSetting: {
      upsert: jest.fn(),
    },
  };
  return {
    appSetting: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    __tx: tx,
  };
};

const makeAudit = () => ({
  record: jest.fn<Promise<void>, [unknown, unknown]>(),
});

const build = () => {
  const prisma = makePrisma();
  const audit = makeAudit();
  const svc = new SettingsService(prisma as never, audit as never);
  return { svc, prisma, audit };
};

describe('SettingsService', () => {
  describe('getBranding', () => {
    it('returns the stored hue as a number', async () => {
      const { svc, prisma } = build();
      prisma.appSetting.findUnique.mockResolvedValue({
        key: BRAND_HUE_KEY,
        value: '210',
      });

      await expect(svc.getBranding()).resolves.toEqual({ hue: 210 });
      expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({
        where: { key: BRAND_HUE_KEY },
      });
    });

    it('falls back to the default hue when nothing is stored', async () => {
      const { svc, prisma } = build();
      prisma.appSetting.findUnique.mockResolvedValue(null);

      await expect(svc.getBranding()).resolves.toEqual({
        hue: DEFAULT_BRAND_HUE,
      });
    });

    it('falls back to the default when the stored value is not a number', async () => {
      const { svc, prisma } = build();
      prisma.appSetting.findUnique.mockResolvedValue({
        key: BRAND_HUE_KEY,
        value: 'banana',
      });

      await expect(svc.getBranding()).resolves.toEqual({
        hue: DEFAULT_BRAND_HUE,
      });
    });
  });

  describe('setBranding', () => {
    it('upserts the hue and writes an audit row in a transaction', async () => {
      const { svc, prisma, audit } = build();
      prisma.__tx.appSetting.upsert.mockResolvedValue({
        key: BRAND_HUE_KEY,
        value: '120',
      });

      await expect(svc.setBranding(120, 'admin-1')).resolves.toEqual({
        hue: 120,
      });

      expect(prisma.__tx.appSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: BRAND_HUE_KEY },
          create: { key: BRAND_HUE_KEY, value: '120' },
          update: { value: '120' },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          entityType: 'AppSetting',
          entityId: BRAND_HUE_KEY,
          metadata: { hue: 120 },
        }),
        prisma.__tx,
      );
    });
  });
});
