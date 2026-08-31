import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReceiptSettings } from './entities/receipt-settings.entity';
import { ReceiptSettingsRepository } from './receipt-settings.repository';
import { UpdateReceiptSettingsDto } from './dto/update-receipt-settings.dto';
import { Organization } from '../organizations/entities/organization.entity';

const DEFAULT_ACCENT_COLOR = '#2563EB';
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * ReceiptSettingsService
 *
 * §12: an organization must always have a usable receipt config,
 * even if never explicitly set. getSettings() creates a
 * default-backed row on first read rather than returning null —
 * displayName defaults to Organization.name (confirmed field, not
 * "displayName" — Organization has no such column), accentColor
 * defaults to DEFAULT_ACCENT_COLOR. This means "no settings row yet"
 * is invisible to callers; they always get a real ReceiptSettings.
 *
 * §11: accentColor must be a valid hex color. Validated here, not
 * left to the DTO layer's basic @IsString, since the directive is
 * specific about the format ("#RRGGBB") not just "is a string."
 */
@Injectable()
export class ReceiptSettingsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    private readonly receiptSettingsRepository: ReceiptSettingsRepository,
  ) {}

  async getSettings(organizationId: string): Promise<ReceiptSettings> {
    const existing =
      await this.receiptSettingsRepository.findByOrganization(organizationId);
    if (existing) {
      return existing;
    }

    const organization = await this.organizationsRepo.findOne({
      where: { id: organizationId },
    });

    return this.receiptSettingsRepository.create({
      organizationId,
      displayName: organization?.name ?? 'Your Business',
      accentColor: DEFAULT_ACCENT_COLOR,
    });
  }

  async updateSettings(
    organizationId: string,
    dto: UpdateReceiptSettingsDto,
  ): Promise<ReceiptSettings> {
    const settings = await this.getSettings(organizationId);

    if (dto.accentColor !== undefined) {
      if (!HEX_COLOR_PATTERN.test(dto.accentColor)) {
        throw new BadRequestException(
          `accentColor must be a 6-digit hex color (e.g. #2563EB), got: ${dto.accentColor}`,
        );
      }
      settings.accentColor = dto.accentColor;
    }

    if (dto.displayName !== undefined) {
      settings.displayName = dto.displayName;
    }

    return this.receiptSettingsRepository.save(settings);
  }
}
