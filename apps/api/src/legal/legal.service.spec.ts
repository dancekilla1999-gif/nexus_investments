import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';

function buildPrismaMock() {
  return {
    riskDisclosureAgreement: {
      findFirst: jest.fn(),
    },
    riskDisclosureAcceptance: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
}

function buildService(prisma: ReturnType<typeof buildPrismaMock>) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new LegalService(prisma as any, audit as any), audit };
}

const CURRENT_AGREEMENT = {
  id: 'agreement_1',
  version: 3,
  title: 'Managed Account Risk Disclosure',
  bodyMarkdown: 'draft text',
  isCurrent: true,
  effectiveAt: new Date('2026-01-01'),
};

describe('LegalService', () => {
  describe('getCurrentRiskDisclosureAgreement', () => {
    it('returns the current agreement without leaking internal-only fields implicitly', async () => {
      const prisma = buildPrismaMock();
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      const { service } = buildService(prisma);

      const result = await service.getCurrentRiskDisclosureAgreement();
      expect(result.version).toBe(3);
      expect(result.title).toBe('Managed Account Risk Disclosure');
    });

    it('throws NotFoundException when no agreement is published', async () => {
      const prisma = buildPrismaMock();
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(null);
      const { service } = buildService(prisma);

      await expect(service.getCurrentRiskDisclosureAgreement()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAcceptanceStatus', () => {
    it('reports accepted:false when the user has no acceptance record', async () => {
      const prisma = buildPrismaMock();
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      prisma.riskDisclosureAcceptance.findUnique.mockResolvedValue(null);
      const { service } = buildService(prisma);

      const status = await service.getAcceptanceStatus('user_1');
      expect(status).toEqual({ accepted: false, agreementVersion: 3, acceptedAt: null });
    });

    it('reports accepted:true with the acceptance timestamp when one exists', async () => {
      const prisma = buildPrismaMock();
      const acceptedAt = new Date('2026-02-01');
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      prisma.riskDisclosureAcceptance.findUnique.mockResolvedValue({ acceptedAt });
      const { service } = buildService(prisma);

      const status = await service.getAcceptanceStatus('user_1');
      expect(status).toEqual({ accepted: true, agreementVersion: 3, acceptedAt });
    });
  });

  describe('acceptCurrentRiskDisclosureAgreement', () => {
    it('records a new acceptance and writes an audit log entry', async () => {
      const prisma = buildPrismaMock();
      const acceptedAt = new Date('2026-03-01');
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      prisma.riskDisclosureAcceptance.findUnique.mockResolvedValue(null);
      prisma.riskDisclosureAcceptance.create.mockResolvedValue({ acceptedAt });
      const { service, audit } = buildService(prisma);

      const result = await service.acceptCurrentRiskDisclosureAgreement('user_1', {
        ip: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(result).toEqual({ accepted: true, agreementVersion: 3, acceptedAt });
      expect(prisma.riskDisclosureAcceptance.create).toHaveBeenCalledWith({
        data: { userId: 'user_1', agreementId: 'agreement_1', ip: '127.0.0.1', userAgent: 'jest' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'legal.risk_disclosure.accepted', actorId: 'user_1' }),
      );
    });

    it('is idempotent: accepting an already-accepted agreement does not create a duplicate', async () => {
      const prisma = buildPrismaMock();
      const acceptedAt = new Date('2026-03-01');
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      prisma.riskDisclosureAcceptance.findUnique.mockResolvedValue({ acceptedAt });
      const { service, audit } = buildService(prisma);

      const result = await service.acceptCurrentRiskDisclosureAgreement('user_1', {});

      expect(result).toEqual({ accepted: true, agreementVersion: 3, acceptedAt });
      expect(prisma.riskDisclosureAcceptance.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('assertCurrentAgreementAccepted', () => {
    it('throws ForbiddenException when the user has not accepted', async () => {
      const prisma = buildPrismaMock();
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      prisma.riskDisclosureAcceptance.findUnique.mockResolvedValue(null);
      const { service } = buildService(prisma);

      await expect(service.assertCurrentAgreementAccepted('user_1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('resolves silently when the user has accepted', async () => {
      const prisma = buildPrismaMock();
      prisma.riskDisclosureAgreement.findFirst.mockResolvedValue(CURRENT_AGREEMENT);
      prisma.riskDisclosureAcceptance.findUnique.mockResolvedValue({ acceptedAt: new Date() });
      const { service } = buildService(prisma);

      await expect(service.assertCurrentAgreementAccepted('user_1')).resolves.toBeUndefined();
    });
  });
});
