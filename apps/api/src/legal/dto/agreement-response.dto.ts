import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class AgreementResponseDto {
  @Expose() id!: string;
  @Expose() version!: number;
  @Expose() title!: string;
  @Expose() bodyMarkdown!: string;
  @Expose() effectiveAt!: Date;
}
